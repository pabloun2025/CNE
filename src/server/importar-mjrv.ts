import * as XLSX from "xlsx";
import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { query, withTx } from "./db";
import { normalizarFilas, type Vista } from "../domain/importacion/mjrv";

export const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILAS = 3000;

// Excel o CSV: primera hoja, valores tal cual (la cédula como texto).
export function leerArchivo(buffer: Buffer, nombre: string): Record<string, unknown>[] {
  if (buffer.length > MAX_BYTES) throw new Error("El archivo supera 5 MB.");
  const libro = XLSX.read(buffer, { type: "buffer", raw: true });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  if (!hoja) throw new Error(`El archivo ${nombre} no tiene hojas.`);
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: "", raw: true });
  if (filas.length > MAX_FILAS) throw new Error(`Máximo ${MAX_FILAS} filas por archivo.`);
  return filas;
}

export type Ausente = { id: number; cedula: string; apellidos: string; nombres: string };
export type VistaImportacion = Vista & { nuevas: number; actualizadas: number; ausentes: Ausente[] };

export async function prepararVista(buffer: Buffer, nombre: string): Promise<VistaImportacion> {
  const vista = normalizarFilas(leerArchivo(buffer, nombre));
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
