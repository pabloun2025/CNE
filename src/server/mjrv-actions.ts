"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "./guard";
import { cambiarBaja, crearMjrv, editarMjrv, type DatosMjrv } from "./mjrv";

export type EstadoMjrv = { error?: string; aviso?: string } | null;

const texto = (f: FormData, k: string) => String(f.get(k) ?? "");
const datos = (f: FormData): DatosMjrv => ({ cedula: texto(f, "cedula"), apellidos: texto(f, "apellidos"), nombres: texto(f, "nombres"), cargo: texto(f, "cargo"), junta: texto(f, "junta"), correo: texto(f, "correo"), telefono: texto(f, "telefono"), rotulo: texto(f, "rotulo") });

export async function crearMjrvAccion(_: EstadoMjrv, f: FormData): Promise<EstadoMjrv> {
  const sesion = await requireAdmin();
  const r = await crearMjrv(sesion, datos(f));
  if (!r.ok) return { error: r.mensaje };
  revalidatePath("/admin/mjrv");
  redirect(`/admin/mjrv/${r.id}`);
}

export async function editarMjrvAccion(_: EstadoMjrv, f: FormData): Promise<EstadoMjrv> {
  const sesion = await requireAdmin();
  const id = Number(f.get("id"));
  const r = await editarMjrv(sesion, id, datos(f));
  if (!r.ok) return { error: r.mensaje };
  revalidatePath(`/admin/mjrv/${id}`);
  return { aviso: "Cambios guardados." };
}

export async function bajaMjrvAccion(f: FormData): Promise<void> {
  const sesion = await requireAdmin();
  const id = Number(f.get("id"));
  await cambiarBaja(sesion, id, f.get("baja") === "1", texto(f, "motivo"));
  revalidatePath(`/admin/mjrv/${id}`);
}
