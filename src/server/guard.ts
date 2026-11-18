import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { leerSesion, type PortalSesion, type Sesion } from "./auth";
import type { Funcion } from "../domain/estaciones";
import { validarEstacion, type SesionEstacion } from "./estaciones";
import { cookieSecure } from "./env";

export const COOKIE: Record<PortalSesion, string> = { admin: "cne_admin", superadmin: "cne_super" };
const RUTA: Record<PortalSesion, string> = { admin: "/admin", superadmin: "/superadmin" };

export function cookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: cookieSecure(), path: "/", maxAge: 60 * 60 * 16 };
}

async function exigir(portal: PortalSesion, permitirCambio: boolean, permitirSinMfa: boolean): Promise<Sesion> {
  const token = (await cookies()).get(COOKIE[portal])?.value;
  const sesion = await leerSesion(token, portal);
  if (!sesion) redirect(`${RUTA[portal]}/acceso`);
  if (sesion.debeCambiar && !permitirCambio) redirect(`${RUTA[portal]}/cambiar-contrasena`);
  // La superadministración no abre nada sin la verificación en dos pasos de esta sesión (M18).
  if (portal === "superadmin" && !sesion.mfaVerificada && !permitirSinMfa) redirect("/superadmin/verificacion");
  return sesion;
}

// Cada página, layout y acción del portal llama a su guarda: validan cookie, sesión y tipo de usuario en el servidor.
export const requireAdmin = (opciones: { permitirCambio?: boolean } = {}) => exigir("admin", !!opciones.permitirCambio, true);
// permitirCambio: pantalla de cambio de contraseña. permitirSinMfa: solo la pantalla de verificación en dos pasos.
export const requireSuperadmin = (opciones: { permitirCambio?: boolean; permitirSinMfa?: boolean } = {}) =>
  exigir("superadmin", !!opciones.permitirCambio, !!opciones.permitirSinMfa || !!opciones.permitirCambio);

// Para rutas API: sin redirecciones, devuelve null y la ruta responde 401.
export async function sesionApi(portal: PortalSesion): Promise<Sesion | null> {
  const sesion = await leerSesion((await cookies()).get(COOKIE[portal])?.value, portal);
  if (!sesion || sesion.debeCambiar) return null;
  return portal === "superadmin" && !sesion.mfaVerificada ? null : sesion;
}

// IP del cliente: Cloudflare pone CF-Connecting-IP; si falta, la primera de X-Forwarded-For.
export async function ipCliente(): Promise<string | null> {
  const h = await headers();
  return h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export const COOKIE_ESTACION = "cne_estacion";

// Estación (puerta, documentación, finanzas, mando): cookie → sesión → enlace y operador activos → función permitida.
export async function requireEstacion(token: string, funciones: Funcion[]): Promise<SesionEstacion> {
  const r = await validarEstacion((await cookies()).get(COOKIE_ESTACION)?.value, funciones);
  if (!r.ok) redirect(`/e/${token}`);
  return r.sesion;
}

// Para rutas API de estación: devuelve la sesión o el estado HTTP que debe responder la ruta.
export async function estacionApi(funciones: Funcion[]) {
  return validarEstacion((await cookies()).get(COOKIE_ESTACION)?.value, funciones);
}

// Admin o estación: rutas compartidas (centro de mando).
export async function adminOEstacionApi(funciones: Funcion[]): Promise<{ tipo: "admin"; sesion: Sesion } | { tipo: "estacion"; sesion: SesionEstacion } | null> {
  const admin = await sesionApi("admin");
  if (admin) return { tipo: "admin", sesion: admin };
  const e = await estacionApi(funciones);
  return e.ok ? { tipo: "estacion", sesion: e.sesion } : null;
}
