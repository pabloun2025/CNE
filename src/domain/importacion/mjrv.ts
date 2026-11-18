// Importador de MJRV (01 §8). El mapeo de columnas vive en un único objeto para adaptarlo al archivo real.
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { leerJunta, type Serie } from "../juntas";

// Campo interno → posibles encabezados (ya sin tildes ni mayúsculas).
export const MAPEO_COLUMNAS = {
  cedula: ["cedula", "cedula de identidad", "ci", "numero de cedula"],
  apellidos: ["apellidos", "apellido"],
  nombres: ["nombres", "nombre"],
  cargo: ["cargo", "funcion", "cargo en junta", "rol"],
  serie: ["serie", "sexo", "genero"],
  junta: ["junta", "numero de junta", "n junta", "jrv"],
  correo: ["correo", "email", "correo electronico"],
  telefono: ["telefono", "celular", "movil", "whatsapp"],
  rotulo: ["rotulo", "rotulo credencial", "credencial", "codigo credencial", "etiqueta"],
} as const;
export type Campo = keyof typeof MAPEO_COLUMNAS;

export type Rol = "presidente" | "secretario" | "vocal" | "suplente" | "otro";
export type FilaMjrv = {
  fila: number; // número de fila en el archivo (la 1 es el encabezado)
  cedula: string; apellidos: string; nombres: string; cargo: string; rol: Rol;
  serie: Serie | null; numero: number | null; correo: string | null; telefono: string | null; rotulo: string | null;
};
export type FilaVista = { datos: FilaMjrv; errores: string[]; advertencias: string[] };
export type Vista = {
  filas: FilaVista[]; avisosJunta: string[]; errores: number; advertencias: number; validas: number;
  // D02: el archivo no trae columna de rótulo (se imprime el texto de la junta tal cual).
  sinColumnaRotulo: boolean;
  // D02: el archivo usa M = masculino / F = femenino. Recuento de filas por serie ya interpretada.
  nomenclaturaMF: boolean; porSerie: { H: number; M: number };
};

export const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();

export function rolDeCargo(cargo: string): Rol {
  const c = sinTildes(cargo);
  if (c.includes("suplente")) return "suplente";
  if (c.includes("president")) return "presidente";
  if (c.includes("secretari")) return "secretario";
  if (c.includes("vocal")) return "vocal";
  return "otro";
}

// Dígito verificador ecuatoriano (módulo 10). Solo advierte: el CNE puede tener cédulas atípicas (§16.5).
export function cedulaEcuatorianaValida(c: string): boolean {
  if (!/^\d{10}$/.test(c)) return false;
  const provincia = Number(c.slice(0, 2));
  if (!((provincia >= 1 && provincia <= 24) || provincia === 30) || Number(c[2]) > 5) return false;
  const suma = [...c.slice(0, 9)].reduce((s, d, i) => {
    const v = Number(d) * (i % 2 === 0 ? 2 : 1);
    return s + (v > 9 ? v - 9 : v);
  }, 0);
  return (10 - (suma % 10)) % 10 === Number(c[9]);
}

function textoCelda(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  return String(v).trim();
}

// Asigna a cada campo la clave real de la fila según el mapeo.
export function columnasDe(claves: string[]): Partial<Record<Campo, string>> {
  const resultado: Partial<Record<Campo, string>> = {};
  for (const campo of Object.keys(MAPEO_COLUMNAS) as Campo[]) {
    const clave = claves.find((k) => (MAPEO_COLUMNAS[campo] as readonly string[]).includes(sinTildes(k)));
    if (clave) resultado[campo] = clave;
  }
  return resultado;
}

export function normalizarFilas(filas: Record<string, unknown>[]): Vista {
  const columnas = columnasDe(Object.keys(filas[0] ?? {}));
  const faltan = (["cedula", "apellidos", "nombres", "cargo", "junta"] as Campo[]).filter((c) => !columnas[c]);
  if (filas.length === 0) {
    return { filas: [], avisosJunta: [], errores: 1, advertencias: 0, validas: 0, sinColumnaRotulo: false, nomenclaturaMF: false, porSerie: { H: 0, M: 0 } };
  }
  // M/F del modelo de credencial: M = masculino (serie H) y F = femenino (serie M). Solo si alguna celda trae una F.
  // Sin ninguna F se mantiene H/M como siempre; así M01 nunca se convierte en «mujeres» por suposición.
  const celdaTexto = (f: Record<string, unknown>, c: Campo) => (columnas[c] ? textoCelda(f[columnas[c]!]) : "");
  const nomenclaturaMF = filas.some((f) => /^[fF]\s*\d+$/.test(celdaTexto(f, "junta")) || /^(f|femenino)$/.test(sinTildes(celdaTexto(f, "serie"))));
  const celda = (f: Record<string, unknown>, c: Campo) => (columnas[c] ? textoCelda(f[columnas[c]!]) : "");
  const vistas: FilaVista[] = filas.map((f, i) => {
    const errores: string[] = [];
    const advertencias: string[] = [];
    if (faltan.length && i === 0) errores.push(`Faltan columnas: ${faltan.join(", ")}.`);
    let cedula = celda(f, "cedula").toUpperCase().replace(/\s+/g, "");
    // Excel pierde el cero inicial de las cédulas de 10 dígitos.
    if (/^\d{9}$/.test(cedula)) {
      cedula = `0${cedula}`;
      advertencias.push("La cédula tenía 9 dígitos: se añadió un 0 a la izquierda.");
    }
    if (!/^[0-9A-Z-]{5,20}$/.test(cedula)) errores.push("Cédula vacía o con formato no válido.");
    else if (/^\d{10}$/.test(cedula) && !cedulaEcuatorianaValida(cedula)) advertencias.push("El dígito verificador de la cédula no cuadra (no se rechaza).");
    const apellidos = celda(f, "apellidos");
    const nombres = celda(f, "nombres");
    if (!apellidos) errores.push("Faltan los apellidos.");
    if (!nombres) errores.push("Faltan los nombres.");
    const cargo = celda(f, "cargo");
    if (!cargo) errores.push("Falta el cargo.");
    const rol = rolDeCargo(cargo);
    if (cargo && rol === "otro") advertencias.push(`Cargo no reconocido («${cargo}»): se guarda con rol «otro».`);

    // Junta: «H12» en una sola celda, o serie y número en columnas separadas.
    let serie: Serie | null = null;
    let numero: number | null = null;
    const juntaTexto = celda(f, "junta");
    const serieTexto = sinTildes(celda(f, "serie"));
    const formaCombinada = nomenclaturaMF ? /^[fFmM]\s*\d+$/ : /^[hHmM]\s*\d+$/;
    let combinada: { serie: Serie; numero: number } | null = null;
    if (formaCombinada.test(juntaTexto)) {
      const letra = juntaTexto.trim()[0].toUpperCase();
      combinada = nomenclaturaMF ? leerJunta(`${letra === "M" ? "H" : "M"}${juntaTexto.trim().slice(1)}`) : leerJunta(juntaTexto);
    }
    if (combinada) ({ serie, numero } = combinada);
    else {
      const s: Serie | null = nomenclaturaMF
        ? (/^(m|hombre|hombres|masculino|varon)$/.test(serieTexto) ? "H" : /^(f|mujer|mujeres|femenino)$/.test(serieTexto) ? "M" : null)
        : (/^(h|hombre|hombres|masculino|varon)$/.test(serieTexto) ? "H" : /^(m|mujer|mujeres|femenino)$/.test(serieTexto) ? "M" : null);
      const n = /^\d{1,3}$/.test(juntaTexto) ? Number(juntaTexto) : null;
      if (!s || n === null) errores.push("Junta no interpretable: indique serie (H/M) y número, o algo como H12.");
      else if (!leerJunta(`${s}${n}`)) errores.push(`La junta ${s}${n} no existe (hay H1–H41 y M1–M54).`);
      else { serie = s; numero = n; }
    }
    if (combinada === null && /^[hHmMfF]\s*\d+$/.test(juntaTexto)) errores.push(`La junta ${juntaTexto.toUpperCase()} no existe (hay H1–H41 y M1–M54).`);

    let correo: string | null = celda(f, "correo").toLowerCase() || null;
    if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) {
      advertencias.push("Correo no válido: se ignora.");
      correo = null;
    }
    let telefono: string | null = null;
    const telTexto = celda(f, "telefono");
    if (telTexto) {
      const p = parsePhoneNumberFromString(telTexto, "ES");
      if (p?.isValid()) telefono = p.number;
      else advertencias.push("Teléfono no interpretable: se ignora.");
    }
    // El rótulo es el del Excel, tal cual y sin recalcular. Sin columna de rótulo, el texto de la junta si es del tipo «M01».
    const rotulo = columnas.rotulo ? celda(f, "rotulo") || null : /^[A-Za-z]\s*\d+$/.test(juntaTexto) ? juntaTexto : null;
    return { datos: { fila: i + 2, cedula, apellidos, nombres, cargo, rol, serie, numero, correo, telefono, rotulo }, errores, advertencias };
  });

  // Cédula repetida en el archivo: error en todas las apariciones.
  const veces = new Map<string, number>();
  for (const v of vistas) if (v.datos.cedula) veces.set(v.datos.cedula, (veces.get(v.datos.cedula) ?? 0) + 1);
  for (const v of vistas) if ((veces.get(v.datos.cedula) ?? 0) > 1) v.errores.push("Cédula repetida en el archivo.");

  // Avisos por junta (no bloquean).
  const porJunta = new Map<string, FilaMjrv[]>();
  for (const v of vistas) if (v.datos.serie && v.datos.numero) porJunta.set(`${v.datos.serie}${v.datos.numero}`, [...(porJunta.get(`${v.datos.serie}${v.datos.numero}`) ?? []), v.datos]);
  const avisosJunta: string[] = [];
  for (const [junta, gente] of [...porJunta].sort()) {
    if (gente.filter((g) => g.rol === "presidente").length > 1) avisosJunta.push(`La junta ${junta} tiene más de un presidente.`);
    const titulares = gente.filter((g) => g.rol !== "suplente").length;
    if (titulares < 3) avisosJunta.push(`La junta ${junta} tiene menos de 3 titulares en el archivo (${titulares}).`);
  }
  const errores = vistas.filter((v) => v.errores.length).length;
  const porSerie = { H: 0, M: 0 };
  for (const v of vistas) if (v.datos.serie) porSerie[v.datos.serie]++;
  return {
    filas: vistas, avisosJunta, errores, sinColumnaRotulo: !columnas.rotulo, nomenclaturaMF, porSerie,
    advertencias: vistas.filter((v) => v.advertencias.length).length,
    validas: vistas.length - errores,
  };
}
