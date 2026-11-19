import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { query, withTx } from "./db";
import { normalizarFilas, type Vista } from "../domain/importacion/mjrv";

export const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILAS = 3000;

// Valor de celda tal cual: texto, número o fecha. Sin la librería que el auditor marca y no se puede parchear.
function valorCelda(v: ExcelJS.CellValue): unknown {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v && "hyperlink" in v) return v.text;
    if ("result" in v) return valorCelda(v.result);
  }
  return v;
}

function filasDeHoja(hoja: ExcelJS.Worksheet): Record<string, unknown>[] {
  const encabezado = hoja.getRow(1);
  const claves: string[] = [];
  encabezado.eachCell({ includeEmpty: false }, (cell) => {
    claves[Number(cell.col) - 1] = String(valorCelda(cell.value));
  });
  const objetos: Record<string, unknown>[] = [];
  hoja.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const o: Record<string, unknown> = {};
    claves.forEach((clave, i) => {
      if (clave) o[clave] = valorCelda(row.getCell(i + 1).value);
    });
    objetos.push(o);
  });
  return objetos;
}

// El lector de CSV de exceljs convierte 0000000009 en el número 9. Aquí cada celda sigue siendo texto.
function filasCsv(texto: string): Record<string, unknown>[] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  const cerrarCelda = () => { fila.push(celda); celda = ""; };
  const cerrarFila = () => { cerrarCelda(); if (fila.some((c) => c !== "")) filas.push(fila); fila = []; };
  const s = texto.replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (comillas) {
      if (c === '"' && s[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === ",") cerrarCelda();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      cerrarFila();
    } else celda += c;
  }
  if (celda.length > 0 || fila.length > 0) cerrarFila();
  if (filas.length === 0) return [];
  const claves = filas[0];
  return filas.slice(1).map((f) => {
    const o: Record<string, unknown> = {};
    claves.forEach((clave, i) => { if (clave) o[clave] = f[i] ?? ""; });
    return o;
  });
}

// Excel (.xlsx) o CSV. El .xls antiguo no se acepta.
export async function leerArchivo(buffer: Buffer, nombre: string): Promise<Record<string, unknown>[]> {
  if (buffer.length > MAX_BYTES) throw new Error("El archivo supera 5 MB.");
  const bajo = nombre.toLowerCase();
  if (bajo.endsWith(".xls") && !bajo.endsWith(".xlsx")) throw new Error("Use un archivo .xlsx o CSV.");
  let filas: Record<string, unknown>[];
  if (bajo.endsWith(".csv")) filas = filasCsv(buffer.toString("utf8"));
  else {
    const hoja = (await new ExcelJS.Workbook().xlsx.read(Readable.from(buffer))).worksheets[0];
    if (!hoja) throw new Error(`El archivo ${nombre} no tiene hojas.`);
    filas = filasDeHoja(hoja);
  }
  if (filas.length > MAX_FILAS) throw new Error(`Máximo ${MAX_FILAS} filas por archivo.`);
  return filas;
}

export type Ausente = { id: number; cedula: string; apellidos: string; nombres: string };
export type VistaImportacion = Vista & { nuevas: number; actualizadas: number; ausentes: Ausente[] };

export async function prepararVista(buffer: Buffer, nombre: string): Promise<VistaImportacion> {
  const vista = normalizarFilas(await leerArchivo(buffer, nombre));
  const cedulas = vista.filas.map((f) => f.datos.cedula).filter(Boolean);
  const existentes = new Set((await query<{ cedula: string }>("SELECT cedula FROM mjrv WHERE cedula = ANY($1)", [cedulas])).map((r) => r.cedula));
  const enArchivo = vista.filas.filter((f) => !f.errores.length);
  const actualizadas = enArchivo.filter((f) => existentes.has(f.datos.cedula)).length;
  // Ausentes: solo fichas reales activas. Se listan para dar de baja con confirmación; nunca se borran.
  const ausentes = await query<Ausente>("SELECT id, cedula, apellidos, nombres FROM mjrv WHERE activo AND NOT es_prueba AND NOT (cedula = ANY($1)) ORDER BY apellidos", [cedulas]);
  return { ...vista, nuevas: enArchivo.length - actualizadas, actualizadas, ausentes };
}

// Todo o nada: con un solo error no se aplica nada. Se vuelve a leer el archivo en el servidor (no se fía del navegador).
export async function aplicarImportacion(sesion: Sesion, buffer: Buffer, nombre: string, bajas: number[]):
  Promise<{ ok: true; nuevas: number; actualizadas: number; bajas: number } | { ok: false; mensaje: string }> {
  const vista = await prepararVista(buffer, nombre);
  if (vista.errores > 0 || vista.filas.length === 0) return { ok: false, mensaje: "El archivo tiene errores: corríjalos y súbalo de nuevo." };
  const permitidas = new Set(vista.ausentes.map((a) => a.id));
  const bajasValidas = bajas.filter((id) => permitidas.has(id));
  return withTx(async (client) => {
    const juntas = new Map((await client.query<{ id: number; serie: string; numero: number }>("SELECT id, serie, numero FROM juntas_madrid")).rows.map((j) => [`${j.serie}${j.numero}`, j.id]));
    let nuevas = 0;
    for (const f of vista.filas) {
      const d = f.datos;
      const r = await client.query<{ nuevo: boolean }>(
        `INSERT INTO mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, rotulo_credencial, correo, telefono_e164, fuente_archivo, fila_origen, es_prueba)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false)
         ON CONFLICT (cedula) DO UPDATE SET apellidos = EXCLUDED.apellidos, nombres = EXCLUDED.nombres, cargo_original = EXCLUDED.cargo_original,
           rol = EXCLUDED.rol, junta_origen_id = EXCLUDED.junta_origen_id,
           rotulo_credencial = coalesce(EXCLUDED.rotulo_credencial, mjrv.rotulo_credencial),
           correo = coalesce(EXCLUDED.correo, mjrv.correo), telefono_e164 = coalesce(EXCLUDED.telefono_e164, mjrv.telefono_e164),
           fuente_archivo = EXCLUDED.fuente_archivo, fila_origen = EXCLUDED.fila_origen, actualizado_en = now()
         RETURNING (xmax = 0) AS nuevo`,
        [d.cedula, d.apellidos, d.nombres, d.cargo, d.rol, juntas.get(`${d.serie}${d.numero}`), d.rotulo, d.correo, d.telefono, nombre, d.fila],
      );
      if (r.rows[0].nuevo) nuevas++;
    }
    if (bajasValidas.length) {
      await client.query("UPDATE mjrv SET activo = false, baja_motivo = $2, actualizado_en = now() WHERE id = ANY($1)", [bajasValidas, `Ausente en la importación ${nombre}`]);
    }
    await registrarAuditoria({ portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "importacion_mjrv", datos: { archivo: nombre, filas: vista.filas.length, nuevas, bajas: bajasValidas.length } }, client);
    return { ok: true as const, nuevas, actualizadas: vista.filas.length - nuevas, bajas: bajasValidas.length };
  });
}
