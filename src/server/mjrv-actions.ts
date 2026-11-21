"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "./guard";
import { leerIdsCredenciales } from "./credenciales";
import { borrarMjrv, borrarMjrvSeleccion, cambiarBaja, crearMjrv, editarMjrv, type DatosMjrv, type ResultadoBorrar } from "./mjrv";

export type EstadoMjrv = { error?: string; aviso?: string; borrar?: ResultadoBorrar } | null;

const texto = (f: FormData, k: string) => String(f.get(k) ?? "");
const datos = (f: FormData): DatosMjrv => ({
  cedula: texto(f, "cedula"), apellidos: texto(f, "apellidos"), nombres: texto(f, "nombres"), cargo: texto(f, "cargo"),
  junta: `${texto(f, "serie")} ${texto(f, "numero")}`, correo: texto(f, "correo"), telefono: texto(f, "telefono"),
});

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

export async function borrarMjrvAccion(_: EstadoMjrv, f: FormData): Promise<EstadoMjrv> {
  const sesion = await requireAdmin();
  const id = Number(f.get("id"));
  const r = await borrarMjrv(sesion, id, f.get("confirmar") === "1");
  if (!r.ok) return { error: r.mensaje, borrar: r };
  revalidatePath("/admin/mjrv");
  revalidatePath("/admin/credenciales");
  redirect("/admin/mjrv");
}

export async function borrarMjrvSeleccionAccion(f: FormData) {
  const sesion = await requireAdmin();
  const ids = leerIdsCredenciales(f.getAll("ids"));
  if (!ids) return { ok: false as const, mensaje: "Seleccione fichas válidas." };
  const r = await borrarMjrvSeleccion(sesion, ids, f.get("confirmar") === "1");
  if (r.ok && r.borradas) {
    revalidatePath("/admin/mjrv");
    revalidatePath("/admin/credenciales");
  }
  return r;
}

export async function bajaMjrvAccion(f: FormData): Promise<void> {
  const sesion = await requireAdmin();
  const id = Number(f.get("id"));
  await cambiarBaja(sesion, id, f.get("baja") === "1", texto(f, "motivo"));
  revalidatePath(`/admin/mjrv/${id}`);
}
