import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { leerSesion, type PortalSesion, type Sesion } from "./auth";
import type { Funcion } from "../domain/estaciones";
import { validarEstacion, type SesionEstacion } from "./estaciones";
import { cookieSecure } from "./env";
import { INICIO_DE_ROL, SOLO_CONSUL, TODOS_LOS_ROLES, type RolAdmin } from "../domain/roles";

export const COOKIE: Record<PortalSesion, string> = { admin: "cne_admin", superadmin: "cne_super" };
const RUTA: Record<PortalSesion, string> = { admin: "/admin", superadmin: "/superadmin" };

export function cookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: cookieSecure(), path: "/", maxAge: 60 * 60 * 16 };
}

async function exigir(portal: PortalSesion, permitirCambio: boolean, roles: RolAdmin[] = TODOS_LOS_ROLES): Promise<Sesion> {
  const token = (await cookies()).get(COOKIE[portal])?.value;
  const sesion = await leerSesion(token, portal);
  if (!sesion) redirect(`${RUTA[portal]}/acceso`);
  if (sesion.debeCambiar && !permitirCambio) redirect(`${RUTA[portal]}/cambiar-contrasena`);
  // Rol de la administración Madrid: lo que no le corresponde lo lleva a su pantalla (que su rol sí puede ver).
  if (portal === "admin" && !roles.includes(sesion.rol)) redirect(INICIO_DE_ROL[sesion.rol]);
  return sesion;
}

// Cada página, layout y acción del portal llama a su guarda: validan cookie, sesión y tipo de usuario en el servidor.
// roles: quién puede usar la pantalla o acción. Si no se indica, solo «consul»: una pantalla nueva nace cerrada.
export const requireAdmin = (opciones: { permitirCambio?: boolean; roles?: RolAdmin[] } = {}) => exigir("admin", !!opciones.permitirCambio, opciones.roles ?? SOLO_CONSUL);
// permitirCambio: pantalla de cambio de contraseña, antes de exigir una contraseña propia.
export const requireSuperadmin = (opciones: { permitirCambio?: boolean } = {}) => exigir("superadmin", !!opciones.permitirCambio);

// Para rutas API: sin redirecciones, devuelve null y la ruta responde 401.
// En el portal admin, roles por defecto = solo «consul».
export async function sesionApi(portal: PortalSesion, roles: RolAdmin[] = SOLO_CONSUL): Promise<Sesion | null> {
  const sesion = await leerSesion((await cookies()).get(COOKIE[portal])?.value, portal);
  if (!sesion || sesion.debeCambiar) return null;
  if (portal === "admin" && !roles.includes(sesion.rol)) return null;
  return sesion;
}

// IP del cliente: Cloudflare pone CF-Connecting-IP; si falta, la primera de X-Forwarded-For.
export async function ipCliente(): Promise<string | null> {
  const h = await headers();
  return h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export const COOKIE_ESTACION = "cne_estacion";

// Mando requiere una sesión del enlace que abrió ese operador.
export async function requireEstacion(token: string, enlaceId: number): Promise<SesionEstacion> {
  const r = await validarEstacion((await cookies()).get(COOKIE_ESTACION)?.value, ["mando"]);
  if (!r.ok || r.sesion.enlaceId !== enlaceId) redirect(`/e/${token}`);
  return r.sesion;
}

// Para rutas API de estación: devuelve la sesión o el estado HTTP que debe responder la ruta.
export async function estacionApi(funciones: Funcion[]) {
  return validarEstacion((await cookies()).get(COOKIE_ESTACION)?.value, funciones);
}

// Admin o estación: rutas compartidas (centro de mando).
export async function adminOEstacionApi(funciones: Funcion[], rolesAdmin: RolAdmin[] = SOLO_CONSUL): Promise<{ tipo: "admin"; sesion: Sesion } | { tipo: "estacion"; sesion: SesionEstacion } | null> {
  const admin = await sesionApi("admin", rolesAdmin);
  if (admin) return { tipo: "admin", sesion: admin };
  const e = await estacionApi(funciones);
  return e.ok ? { tipo: "estacion", sesion: e.sesion } : null;
}

// Respuesta de rechazo de las rutas API de administración: 403 si hay sesión admin válida pero su rol no alcanza; 401 si no hay sesión.
export async function rechazoAdminApi(): Promise<Response> {
  const hay = await sesionApi("admin", TODOS_LOS_ROLES);
  return Response.json({ error: hay ? "Su rol no permite esto." : "No autorizado" }, { status: hay ? 403 : 401 });
}
