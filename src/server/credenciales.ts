import { etiquetaJunta, leerJunta, ZONAS, type Serie, type ZonaColor } from "../domain/juntas";
import type { DatosCredencial } from "./pdf/credencial";
import { leerModo } from "./config";
import { query } from "./db";

export type Seleccion = { alcance: "ids" | "todas" | "junta" | "zona" | "sin_generar"; valor?: string; ids?: number[] };

export type PersonaCredencial = { id: number; nombre: string; rotulo: string; junta: string; zona: ZonaColor; sinPreparar: boolean };

export type ResultadoSeleccion = { datos: DatosCredencial[]; ids: number[]; personas: PersonaCredencial[]; sinRotulo: number; total: number };

export const nombrePdfCredencial = (junta: string, cedula: string) => `${junta}-${cedula}.pdf`;

export function leerIdsCredenciales(valores: (string | File)[]): number[] | null {
  if (!valores.length) return null;
  const ids = new Set<number>();
  for (const valor of valores) {
    if (typeof valor !== "string" || !/^[1-9]\d*$/.test(valor)) return null;
    const id = Number(valor);
    if (!Number.isSafeInteger(id)) return null;
    ids.add(id);
  }
  return [...ids];
}

// Solo fichas activas. Sin rótulo de credencial no se imprime (P-5): se excluyen y se cuentan para avisar.
export async function seleccionarParaCredencial(sel: Seleccion): Promise<ResultadoSeleccion> {
  const where = ["m.activo"];
  const p: unknown[] = [];
  const vacia = { datos: [], ids: [], personas: [], sinRotulo: 0, total: 0 };
  if (sel.alcance === "ids") { p.push(sel.ids ?? []); where.push(`m.id = ANY($${p.length}::bigint[])`); }
  else if (sel.alcance === "junta") {
    const j = leerJunta(sel.valor ?? "");
    if (!j) return vacia;
    p.push(j.serie, j.numero);
    where.push(`jo.serie = $${p.length - 1} AND jo.numero = $${p.length}`);
  } else if (sel.alcance === "zona") {
    if (!(ZONAS as string[]).includes(sel.valor ?? "")) return vacia;
    p.push(sel.valor);
    where.push(`jo.zona_color = $${p.length}`);
  } else if (sel.alcance === "sin_generar") where.push("m.credencial_generada_en IS NULL");
  const modoPrueba = (await leerModo()) === "prueba";
  const filas = await query<{ id: number; cedula: string; apellidos: string; nombres: string; cargo_original: string; rotulo_credencial: string | null; serie: Serie; numero: number; zona_color: ZonaColor; es_prueba: boolean; sin_preparar: boolean }>(
    `SELECT m.id, m.cedula, m.apellidos, m.nombres, m.cargo_original, m.rotulo_credencial, jo.serie, jo.numero, jo.zona_color,
            m.es_prueba, m.credencial_generada_en IS NULL AS sin_preparar
       FROM mjrv m JOIN juntas_madrid jo ON jo.id = m.junta_origen_id
      WHERE ${where.join(" AND ")} ORDER BY jo.serie, jo.numero, m.rol, m.apellidos, m.id`, p);
  const con = filas.filter((f) => f.rotulo_credencial?.trim());
  return {
    total: filas.length,
    sinRotulo: filas.length - con.length,
    ids: con.map((f) => f.id),
    personas: con.map((f) => ({ id: f.id, nombre: `${f.apellidos}, ${f.nombres}`, rotulo: f.rotulo_credencial!.trim(), junta: etiquetaJunta(f.serie, f.numero), zona: f.zona_color, sinPreparar: f.sin_preparar })),
    // En modo prueba, o si la ficha es de prueba, la credencial lleva la franja «PRUEBA».
    datos: con.map((f) => ({ cedula: f.cedula, apellidos: f.apellidos, nombres: f.nombres, cargo: f.cargo_original, rotulo: f.rotulo_credencial!.trim(), serie: f.serie, prueba: modoPrueba || f.es_prueba })),
  };
}

export async function marcarGeneradas(ids: number[]): Promise<void> {
  if (ids.length) await query("UPDATE mjrv SET credencial_generada_en = now() WHERE id = ANY($1::bigint[])", [ids]);
}

export async function resumenCredenciales(): Promise<{ activos: number; preparadas: number; pendientes: number; sinRotulo: number }> {
  const f = await query<{ activos: number; preparadas: number; sin_rotulo: number }>(
    `SELECT count(*)::int AS activos, count(*) FILTER (WHERE credencial_generada_en IS NOT NULL)::int AS preparadas,
            count(*) FILTER (WHERE rotulo_credencial IS NULL OR btrim(rotulo_credencial) = '')::int AS sin_rotulo FROM mjrv WHERE activo`);
  const r = f[0];
  return { activos: r.activos, preparadas: r.preparadas, pendientes: r.activos - r.preparadas, sinRotulo: r.sin_rotulo };
}
