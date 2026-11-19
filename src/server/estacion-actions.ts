"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { activarOperador, cerrarSesionEstacion, crearEnlace, crearOperador, identificarEstacion, identificarPuerta, restablecerPin, revocarEnlace } from "./estaciones";
import { COOKIE_ESTACION, cookieOptions, requireAdmin } from "./guard";

export type EstadoEstacion = { error?: string; aviso?: string } | null;
const texto = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function crearOperadorAccion(_: EstadoEstacion, f: FormData): Promise<EstadoEstacion> {
  const sesion = await requireAdmin();
  if (texto(f, "pin") !== texto(f, "pin2")) return { error: "Los dos PIN no coinciden." };
  const r = await crearOperador(sesion, texto(f, "nombre"), texto(f, "apellido"), f.getAll("funciones").map(String), texto(f, "pin"));
  revalidatePath("/admin/operadores");
  return r.ok ? { aviso: "Operador creado." } : { error: r.mensaje };
}

export async function restablecerPinAccion(_: EstadoEstacion, f: FormData): Promise<EstadoEstacion> {
  const sesion = await requireAdmin();
  if (texto(f, "pin") !== texto(f, "pin2")) return { error: "Los dos PIN no coinciden." };
  const r = await restablecerPin(sesion, Number(f.get("id")), texto(f, "pin"));
  return r.ok ? { aviso: "PIN cambiado." } : { error: r.mensaje };
}

export async function activarOperadorAccion(f: FormData): Promise<void> {
  const sesion = await requireAdmin();
  await activarOperador(sesion, Number(f.get("id")), f.get("activo") === "1");
  revalidatePath("/admin/operadores");
}

export async function crearEnlaceAccion(_: EstadoEstacion, f: FormData): Promise<EstadoEstacion> {
  const sesion = await requireAdmin();
  const r = await crearEnlace(sesion, texto(f, "funcion"), texto(f, "etiqueta"));
  revalidatePath("/admin/operadores");
  return r.ok ? { aviso: "Enlace creado. Aparece abajo con su QR." } : { error: r.mensaje };
}

export async function revocarEnlaceAccion(f: FormData): Promise<void> {
  const sesion = await requireAdmin();
  await revocarEnlace(sesion, Number(f.get("id")));
  revalidatePath("/admin/operadores");
}

// Acceso de la estación: nombre + PIN. Sin sesión de administración.
export async function entrarPuertaAccion(token: string, nombre: string, apellido: string, pin: string): Promise<{ error: string } | never> {
  const r = await identificarPuerta(token, nombre, apellido, pin, (await headers()).get("user-agent"));
  if (!r.ok) return { error: r.mensaje };
  (await cookies()).set(COOKIE_ESTACION, r.sesionToken, cookieOptions());
  redirect(`/e/${token}/trabajo`);
}

export async function entrarEstacionAccion(token: string, operadorId: number, pin: string): Promise<{ error: string } | never> {
  const r = await identificarEstacion(token, operadorId, pin, (await headers()).get("user-agent"));
  if (!r.ok) return { error: r.mensaje };
  (await cookies()).set(COOKIE_ESTACION, r.sesionToken, cookieOptions());
  redirect(`/e/${token}/trabajo`);
}

export async function cambiarOperadorAccion(token: string): Promise<void> {
  const jar = await cookies();
  await cerrarSesionEstacion(jar.get(COOKIE_ESTACION)?.value);
  jar.delete(COOKIE_ESTACION);
  redirect(`/e/${token}`);
}
