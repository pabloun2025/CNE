"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "./guard";
import { activarAdmin, cambiarModo, crearAdmin, restablecerAdmin } from "./superadmin";
import type { Modo } from "./config";

export type EstadoSuper = { error?: string; aviso?: string; password?: string } | null;

export async function crearAdminAccion(_: EstadoSuper, f: FormData): Promise<EstadoSuper> {
  const sesion = await requireSuperadmin();
  const r = await crearAdmin(sesion, String(f.get("correo") ?? ""), String(f.get("nombre") ?? ""));
  revalidatePath("/superadmin");
  return r.ok ? { aviso: "Cuenta creada. Entregue esta contraseña temporal; no se vuelve a mostrar.", password: r.password } : { error: r.mensaje };
}

export async function restablecerAdminAccion(_: EstadoSuper, f: FormData): Promise<EstadoSuper> {
  const sesion = await requireSuperadmin();
  const r = await restablecerAdmin(sesion, Number(f.get("id")));
  return r.ok ? { aviso: "Contraseña temporal nueva. No se vuelve a mostrar.", password: r.password } : { error: r.mensaje };
}

export async function activarAdminAccion(f: FormData): Promise<void> {
  const sesion = await requireSuperadmin();
  await activarAdmin(sesion, Number(f.get("id")), f.get("activo") === "1");
  revalidatePath("/superadmin");
}

export async function cambiarModoAccion(_: EstadoSuper, f: FormData): Promise<EstadoSuper> {
  const sesion = await requireSuperadmin();
  const destino = f.get("destino") === "eleccion" ? "eleccion" : "prueba";
  const r = await cambiarModo(sesion, destino as Modo, String(f.get("confirmacion") ?? ""));
  revalidatePath("/superadmin", "layout");
  return r.ok ? { aviso: `Modo cambiado a ${destino === "prueba" ? "prueba" : "elección"}.` } : { error: r.mensaje };
}
