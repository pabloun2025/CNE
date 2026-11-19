// Controles de los ingresos de Madrid: un valor por dato, con las opciones que el sistema ya tiene.
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { rolDeCargo, type Rol } from "./importacion/mjrv";
import { etiquetaJunta, TRAMOS, ZONA_NOMBRE, type Serie } from "./juntas";

export const CARGOS_FICHA: { valor: Rol; etiqueta: string }[] = [
  { valor: "presidente", etiqueta: "Presidente" },
  { valor: "secretario", etiqueta: "Secretario" },
  { valor: "vocal", etiqueta: "Vocal" },
  { valor: "suplente", etiqueta: "Suplente" },
  { valor: "otro", etiqueta: "Otro" },
];

export const PREFIJO_MOVIL = "+34";
export const CEDULA_MIN = 5;
export const CEDULA_MAX = 20;

export function opcionesJuntas(): { valor: string; etiqueta: string }[] {
  const out: { valor: string; etiqueta: string }[] = [];
  for (const t of TRAMOS) {
    for (let n = t.desde; n <= t.hasta; n++) {
      const valor = etiquetaJunta(t.serie as Serie, n);
      out.push({ valor, etiqueta: `${valor} · ${ZONA_NOMBRE[t.zona]}` });
    }
  }
  return out;
}

// El desplegable manda la clave. También se acepta la etiqueta («Presidente») que ya guardan las fichas.
export function resolverCargo(cargo: string): { rol: Rol; etiqueta: string } | null {
  const c = cargo.trim().toLowerCase();
  const directo = CARGOS_FICHA.find((x) => x.valor === c || x.etiqueta.toLowerCase() === c);
  if (directo) return { rol: directo.valor, etiqueta: directo.etiqueta };
  const rol = rolDeCargo(cargo);
  if (rol === "otro") return null;
  const hallado = CARGOS_FICHA.find((x) => x.valor === rol);
  return hallado ? { rol: hallado.valor, etiqueta: hallado.etiqueta } : null;
}

export function validarCedula(bruto: string): { ok: true; cedula: string } | { ok: false; mensaje: string } {
  const cedula = bruto.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[0-9A-Z-]{5,20}$/.test(cedula)) {
    return { ok: false, mensaje: `La cédula debe tener entre ${CEDULA_MIN} y ${CEDULA_MAX} letras, números o guiones.` };
  }
  return { ok: true, cedula };
}

export function validarCorreo(bruto: string): { ok: true; correo: string | null } | { ok: false; mensaje: string } {
  const correo = bruto.trim().toLowerCase();
  if (!correo) return { ok: true, correo: null };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { ok: false, mensaje: "El correo no es válido." };
  return { ok: true, correo };
}

// El campo nace en +34. Si queda solo el prefijo, no hay número. Otro país: se borra +34 y se escribe el prefijo.
export function validarMovil(bruto: string): { ok: true; telefono: string | null } | { ok: false; mensaje: string } {
  const t = bruto.trim().replace(/[\s()-]/g, "");
  if (t === "" || t === "+" || t === PREFIJO_MOVIL) return { ok: true, telefono: null };
  const p = t.startsWith("+") ? parsePhoneNumberFromString(t) : parsePhoneNumberFromString(PREFIJO_MOVIL + t.replace(/^0+/, ""));
  if (!p?.isValid()) return { ok: false, mensaje: "El móvil no es válido. Empieza en +34; si es de otro país, borre el prefijo y escriba el otro." };
  const tipo = p.getType();
  if (tipo !== "MOBILE" && tipo !== "FIXED_LINE_OR_MOBILE") return { ok: false, mensaje: "Ese número no es un móvil." };
  return { ok: true, telefono: p.number };
}
