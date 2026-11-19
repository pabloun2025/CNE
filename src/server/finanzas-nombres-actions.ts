"use server";

import { CONSUL_Y_FINANCIERO } from "../domain/roles";
import { requireAdmin } from "./guard";
import { corregirNombres, validarCedula, type ActorFicha } from "./mjrv";

async function actor(): Promise<ActorFicha> {
  const sesion = await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  return { tipo: "usuario", id: sesion.usuarioId, nombre: sesion.nombre, portal: "admin" };
}

export async function corregirNombresAccion(f: FormData): Promise<{ ok: boolean; mensaje?: string }> {
  const a = await actor();
  const r = await corregirNombres(a, Number(f.get("id")), String(f.get("apellidos") ?? ""), String(f.get("nombres") ?? ""));
  return r.ok ? { ok: true } : { ok: false, mensaje: r.mensaje };
}

export async function validarCedulaAccion(f: FormData): Promise<{ ok: boolean; mensaje?: string }> {
  const a = await actor();
  const r = await validarCedula(a, Number(f.get("id")));
  return r.ok ? { ok: true } : { ok: false, mensaje: r.mensaje };
}
