import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cedulaEcuatorianaValida, normalizarFilas, rolDeCargo } from "@/domain/importacion/mjrv";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { aplicarImportacion, leerArchivo, prepararVista } from "@/server/importar-mjrv";
import ExcelJS from "exceljs";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const fila = (o: Record<string, unknown> = {}) => ({ cedula: "0000000001", apellidos: "APELLIDO PRUEBA 001", nombres: "NOMBRE PRUEBA", cargo: "Presidente", serie: "H", junta: 12, correo: "", telefono: "", ...o });

describe("dominio de la importación de MJRV", () => {
  it("cédula de 9 dígitos: advertencia y relleno del cero", () => {
    const v = normalizarFilas([fila({ cedula: "123456789" })]);
    expect(v.filas[0].datos.cedula).toBe("0123456789");
    expect(v.filas[0].advertencias.join()).toMatch(/9 dígitos/);
    expect(v.filas[0].errores).toEqual([]);
  });
  it("cargo desconocido → rol otro con advertencia; cargos conocidos", () => {
    const v = normalizarFilas([fila({ cargo: "Coordinador" })]);
    expect(v.filas[0].datos.rol).toBe("otro");
    expect(v.filas[0].advertencias.join()).toMatch(/no reconocido/);
    expect(["Presidente/a", "SECRETARIA", "Vocal 2", "Suplente 1", "Vocal suplente"].map(rolDeCargo)).toEqual(["presidente", "secretario", "vocal", "suplente", "suplente"]);
  });
  it("junta inexistente (H42, M55) → error; H12 y M1 válidas; «H12» en una celda", () => {
    const v = normalizarFilas([fila({ cedula: "0000000002", junta: 42 }), fila({ cedula: "0000000003", serie: "M", junta: 55 }), fila({ cedula: "0000000004", serie: "M", junta: 1 }), fila({ cedula: "0000000005", serie: "", junta: "H12" }), fila({ cedula: "0000000006", serie: "", junta: "M55" })]);
    expect(v.filas.map((f) => f.errores.length > 0)).toEqual([true, true, false, false, true]);
    expect(v.filas[3].datos).toMatchObject({ serie: "H", numero: 12 });
  });
  it("cédula duplicada en el archivo → error en ambas filas", () => {
    const v = normalizarFilas([fila(), fila({ junta: 3 })]);
    expect(v.filas.every((f) => f.errores.some((e) => /repetida/.test(e)))).toBe(true);
    expect(v.errores).toBe(2);
  });
  it("faltan apellidos/nombres → error; teléfono y correo no interpretables → advertencia", () => {
    const v = normalizarFilas([fila({ apellidos: "", correo: "mal", telefono: "123" })]);
    expect(v.filas[0].errores.join()).toMatch(/apellidos/);
    expect(v.filas[0].advertencias.filter((a) => /Correo|Teléfono/.test(a))).toHaveLength(2);
  });
  it("teléfono español válido se pasa a E.164 y avisos por junta", () => {
    const v = normalizarFilas([fila({ telefono: "612 345 678" })]);
    expect(v.filas[0].datos.telefono).toBe("+34612345678");
    expect(v.avisosJunta.join()).toMatch(/menos de 3 titulares/);
  });
  it("dígito verificador ecuatoriano", () => {
    expect(cedulaEcuatorianaValida("1710034065")).toBe(true);
    expect(cedulaEcuatorianaValida("1710034066")).toBe(false);
  });
  it("encabezados con tildes y mayúsculas se reconocen", () => {
    const v = normalizarFilas([{ "Cédula": "0000000001", Apellidos: "A", Nombres: "B", "Cargo": "Vocal", "Serie": "mujeres", "Junta": 3 }]);
    expect(v.filas[0].errores).toEqual([]);
    expect(v.filas[0].datos).toMatchObject({ serie: "M", numero: 3, rol: "vocal" });
  });
});

const sesion: Sesion = { sesionId: "x", usuarioId: 1, correo: "a@x.y", nombre: "Admin", tipo: "madrid_admin", rol: "consul", debeCambiar: false };
async function excel(filas: object[]): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("MJRV");
  const claves = Object.keys(filas[0] ?? {});
  hoja.addRow(claves);
  for (const f of filas) hoja.addRow(claves.map((k) => (f as Record<string, unknown>)[k] ?? ""));
  return Buffer.from(await libro.xlsx.writeBuffer());
}

describe("importación de MJRV contra la base (todo o nada)", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash) VALUES ('madrid_admin','a@x.y','A','x')");
  });
  afterAll(closePools);

  it("un archivo con errores no se aplica y no escribe nada", async () => {
    const archivo = await excel([fila(), fila({ cedula: "0000000002", junta: 42 })]);
    const r = await aplicarImportacion(sesion, archivo, "malo.xlsx", []);
    expect(r.ok).toBe(false);
    expect((await consultarDueno("SELECT 1 FROM cne.mjrv")).length).toBe(0);
  });

  it("un archivo válido se aplica entero y una reimportación actualiza por cédula", async () => {
    const archivo = await excel([fila(), fila({ cedula: "0000000002", cargo: "Vocal", telefono: "612345678", junta: 12 })]);
    expect(await aplicarImportacion(sesion, archivo, "ok.xlsx", [])).toMatchObject({ ok: true, nuevas: 2, actualizadas: 0 });
    const [m] = await consultarDueno<{ es_prueba: boolean; fuente_archivo: string; fila_origen: number; telefono_e164: string }>("SELECT es_prueba, fuente_archivo, fila_origen, telefono_e164 FROM cne.mjrv WHERE cedula = '0000000002'");
    expect(m).toEqual({ es_prueba: false, fuente_archivo: "ok.xlsx", fila_origen: 3, telefono_e164: "+34612345678" });
    const segundo = await excel([fila({ apellidos: "APELLIDO CAMBIADO" })]);
    const vista = await prepararVista(segundo, "segundo.xlsx");
    expect(vista.ausentes.map((a) => a.cedula)).toEqual(["0000000002"]);
    expect(await aplicarImportacion(sesion, segundo, "segundo.xlsx", [])).toMatchObject({ ok: true, nuevas: 0, actualizadas: 1 });
    // Ausentes: no se borran ni se dan de baja sin confirmación.
    expect((await consultarDueno("SELECT 1 FROM cne.mjrv WHERE activo")).length).toBe(2);
    const ausente = vista.ausentes[0].id;
    await aplicarImportacion(sesion, segundo, "segundo.xlsx", [ausente]);
    expect((await consultarDueno<{ activo: boolean }>("SELECT activo FROM cne.mjrv WHERE id = $1", [ausente]))[0].activo).toBe(false);
    expect((await consultarDueno("SELECT 1 FROM cne.mjrv")).length).toBe(2);
  });

  it("lee CSV", async () => {
    const filas = await leerArchivo(Buffer.from("cedula,apellidos,nombres,cargo,serie,junta\n0000000009,A,B,Vocal,M,3\n"), "x.csv");
    expect(filas[0].cedula).toBe("0000000009");
  });
});

describe("D02 · rótulo del Excel y nomenclatura M/F", () => {
  it("con columna «Rótulo» se imprime ese texto tal cual", () => {
    const v = normalizarFilas([fila({ "Rótulo": "ABC-7" }), fila({ cedula: "0000000002", "Rótulo": "" })]);
    expect(v.sinColumnaRotulo).toBe(false);
    expect(v.filas.map((f) => f.datos.rotulo)).toEqual(["ABC-7", null]);
  });
  it("sin columna de rótulo, el rótulo es el texto de la junta y se avisa", () => {
    const v = normalizarFilas([fila({ serie: "", junta: "H12" })]);
    expect(v.sinColumnaRotulo).toBe(true);
    expect(v.filas[0].datos.rotulo).toBe("H12");
    // Serie y número en columnas separadas: no hay texto de junta que imprimir.
    expect(normalizarFilas([fila()]).filas[0].datos.rotulo).toBeNull();
  });
  it("M01 y F01: M = masculino (H1) y F = femenino (M1), con aviso y recuento", () => {
    const v = normalizarFilas([fila({ serie: "", junta: "M01" }), fila({ cedula: "0000000002", serie: "", junta: "F01" })]);
    expect(v.nomenclaturaMF).toBe(true);
    expect(v.filas.map((f) => [f.datos.serie, f.datos.numero, f.datos.rotulo])).toEqual([["H", 1, "M01"], ["M", 1, "F01"]]);
    expect(v.porSerie).toEqual({ H: 1, M: 1 });
    expect(v.errores).toBe(0);
  });
  it("sin ninguna F se mantiene H/M como hoy", () => {
    const v = normalizarFilas([fila({ serie: "", junta: "H12" }), fila({ cedula: "0000000002", serie: "", junta: "M3" })]);
    expect(v.nomenclaturaMF).toBe(false);
    expect(v.filas.map((f) => [f.datos.serie, f.datos.numero])).toEqual([["H", 12], ["M", 3]]);
  });
  it("columna serie con F/M también activa la nomenclatura", () => {
    const v = normalizarFilas([fila({ serie: "M", junta: 2 }), fila({ cedula: "0000000002", serie: "F", junta: 2 })]);
    expect(v.filas.map((f) => f.datos.serie)).toEqual(["H", "M"]);
  });
  it("reimportar sin rótulo no pisa con NULL el rótulo ya guardado", async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash) VALUES ('madrid_admin','a@x.y','A','x')");
    const con = await excel([fila({ "Rótulo": "ROT-1" })]);
    await aplicarImportacion(sesion, con, "con.xlsx", []);
    await aplicarImportacion(sesion, await excel([fila()]), "sin.xlsx", []);
    expect((await consultarDueno<{ rotulo_credencial: string }>("SELECT rotulo_credencial FROM cne.mjrv"))[0].rotulo_credencial).toBe("ROT-1");
    await closePools();
  });
});
