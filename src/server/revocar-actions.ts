"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./guard";
import { revocarFueraDeLista, revocarMjrv } from "./revocar-credencial";

export type EstadoRevocar = { error?: string; aviso?: string } | null;

const texto = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function revocarCredencialAccion(f: FormData): Promise<void> {
  const sesion = await requireAdmin();
  const id = Number(f.get("id"));
  if (Number.isInteger(id) && id > 0) await revocarMjrv(sesion, id);
  revalidatePath("/admin/revocar");
}

export async function revocarFueraAccion(_: EstadoRevocar, f: FormData): Promise<EstadoRevocar> {
  const sesion = await requireAdmin();
  const r = await revocarFueraDeLista(sesion, { cedula: texto(f, "cedula"), apellidos: texto(f, "apellidos"), nombres: texto(f, "nombres") });
  if (!r.ok) return { error: r.mensaje };
  revalidatePath("/admin/revocar");
  return { aviso: r.aviso };
}
