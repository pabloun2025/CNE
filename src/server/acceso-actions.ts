"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { GENERICO, cambiarContrasena, cerrarSesion, definirContrasenaInicial, login, pideDefinirContrasena, type PortalSesion, type ResultadoLogin } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { COOKIE, cookieOptions, ipCliente } from "./guard";

// definir: la cuenta tiene la contraseña pendiente y el formulario debe pedir «Defina su contraseña».
export type EstadoFormulario = { error?: string; definir?: boolean; correo?: string } | null;
const RUTA: Record<PortalSesion, string> = { admin: "/admin", superadmin: "/superadmin" };

async function entrar(portal: PortalSesion, formData: FormData): Promise<EstadoFormulario> {
  const ip = await ipCliente();
  const correo = String(formData.get("correo") ?? "");
  const password = String(formData.get("password") ?? "");
  const agente = (await headers()).get("user-agent");
  let r: ResultadoLogin;
  if (portal === "superadmin" && formData.has("nueva")) {
    r = await definirContrasenaInicial({ correo, nueva: String(formData.get("nueva")), repetir: String(formData.get("repetir") ?? ""), ip, agente });
    if (!r.ok && r.mensaje !== GENERICO) return { error: r.mensaje, definir: true, correo };
  } else if (portal === "superadmin" && !password && (await pideDefinirContrasena(correo, ip))) {
    return { definir: true, correo };
  } else {
    r = await login({ correo, password, portal, ip, agente });
  }
  if (!r.ok) {
    await registrarAuditoria({ portal, actorTipo: "publico", accion: "login_fallido", ip });
    // El correo se devuelve para que el formulario no lo borre; la contraseña no.
    return { error: r.mensaje, correo };
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
