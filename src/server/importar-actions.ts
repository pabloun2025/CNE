"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./guard";
import { aplicarImportacion, MAX_BYTES, prepararVista, type VistaImportacion } from "./importar-mjrv";

export type RespuestaVista = { ok: true; vista: VistaImportacion } | { ok: false; mensaje: string };
export type RespuestaAplicar = { ok: true; nuevas: number; actualizadas: number; bajas: number } | { ok: false; mensaje: string };

async function archivoDe(f: FormData): Promise<{ buffer: Buffer; nombre: string } | string> {
  const a = f.get("archivo");
  if (!(a instanceof File) || a.size === 0) return "Elija un archivo Excel o CSV.";
  if (a.size > MAX_BYTES) return "El archivo supera 5 MB.";
  return { buffer: Buffer.from(await a.arrayBuffer()), nombre: a.name.slice(0, 200) };
}

export async function revisarImportacion(f: FormData): Promise<RespuestaVista> {
  await requireAdmin();
  const a = await archivoDe(f);
  if (typeof a === "string") return { ok: false, mensaje: a };
  try {
    return { ok: true, vista: await prepararVista(a.buffer, a.nombre) };
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
}

export async function aplicarImportacionAccion(f: FormData): Promise<RespuestaAplicar> {
  const sesion = await requireAdmin();
  const a = await archivoDe(f);
  if (typeof a === "string") return { ok: false, mensaje: a };
  const bajas = f.getAll("baja").map(Number).filter(Number.isInteger);
  try {
    const r = await aplicarImportacion(sesion, a.buffer, a.nombre, bajas);
    revalidatePath("/admin/mjrv");
    return r;
  } catch (e) {
    return { ok: false, mensaje: (e as Error).message };
  }
}
