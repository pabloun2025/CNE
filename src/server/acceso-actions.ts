"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cambiarContrasena, cerrarSesion, login, type PortalSesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { COOKIE, cookieOptions, ipCliente } from "./guard";

export type EstadoFormulario = { error?: string } | null;
const RUTA: Record<PortalSesion, string> = { admin: "/admin", superadmin: "/superadmin" };

async function entrar(portal: PortalSesion, formData: FormData): Promise<EstadoFormulario> {
  const ip = await ipCliente();
  const r = await login({
    correo: String(formData.get("correo") ?? ""),
    password: String(formData.get("password") ?? ""),
    portal,
    ip,
    agente: (await headers()).get("user-agent"),
  });
  if (!r.ok) {
    await registrarAuditoria({ portal, actorTipo: "publico", accion: "login_fallido", ip });
    return { error: r.mensaje };
  }
  (await cookies()).set(COOKIE[portal], r.token, cookieOptions());
  await registrarAuditoria({ portal, actorTipo: "usuario", accion: "login", ip });
  redirect(r.debeCambiar ? `${RUTA[portal]}/cambiar-contrasena` : RUTA[portal]);
}

export async function accederAdmin(_: EstadoFormulario, formData: FormData) {
  return entrar("admin", formData);
}
export async function accederSuperadmin(_: EstadoFormulario, formData: FormData) {
  return entrar("superadmin", formData);
}

async function cambiar(portal: PortalSesion, formData: FormData): Promise<EstadoFormulario> {
  const nueva = String(formData.get("nueva") ?? "");
  if (nueva !== String(formData.get("repetir") ?? "")) return { error: "Las dos contraseñas nuevas no coinciden." };
  const token = (await cookies()).get(COOKIE[portal])?.value;
  const r = await cambiarContrasena(token, portal, String(formData.get("actual") ?? ""), nueva);
  if (!r.ok) return { error: r.mensaje };
  await registrarAuditoria({ portal, actorTipo: "usuario", accion: "contrasena_cambiada", ip: await ipCliente() });
  redirect(RUTA[portal]);
}
export async function cambiarContrasenaAdmin(_: EstadoFormulario, formData: FormData) {
  return cambiar("admin", formData);
}
export async function cambiarContrasenaSuperadmin(_: EstadoFormulario, formData: FormData) {
  return cambiar("superadmin", formData);
}

async function salir(portal: PortalSesion): Promise<void> {
  const jar = await cookies();
  await cerrarSesion(jar.get(COOKIE[portal])?.value);
  jar.delete(COOKIE[portal]);
  redirect(`${RUTA[portal]}/acceso`);
}
export async function salirAdmin() {
  await salir("admin");
}
export async function salirSuperadmin() {
  await salir("superadmin");
}
