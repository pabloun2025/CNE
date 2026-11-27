"use server";

import { CONSUL_Y_FINANCIERO } from "../domain/roles";
import { requireAdmin } from "./guard";
import { corregirNombres, desvalidarCedula, marcarDocumentoParaRepetir, validarCedula, type ActorFicha } from "./mjrv";

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
  const id = Number(f.get("id")), modo = f.get("modo"), version = f.get("version");
  if (!Number.isSafeInteger(id) || id < 1 || (modo !== "prueba" && modo !== "eleccion")
    || typeof version !== "string" || !/^[0-9a-f]{64}$/.test(version)) {
    return { ok: false, mensaje: "Vuelva a abrir la vista previa." };
  }
  const r = f.get("repetir") === "si"
    ? await marcarDocumentoParaRepetir(a, id, modo, version, String(f.get("revisionEn") ?? "") || null, String(f.get("motivo") ?? ""))
    : await validarCedula(a, id, modo, version);
  return r.ok ? { ok: true } : { ok: false, mensaje: r.mensaje };
}

export async function desvalidarCedulaAccion(f: FormData): Promise<{ ok: boolean; mensaje?: string }> {
  const a = await actor();
  const id = Number(f.get("id")), modo = f.get("modo"), revisionEn = f.get("revisionEn");
  if (!Number.isSafeInteger(id) || id < 1 || (modo !== "prueba" && modo !== "eleccion")
    || typeof revisionEn !== "string" || !revisionEn || revisionEn.length > 64) {
    return { ok: false, mensaje: "Actualice la lista antes de volver a intentarlo." };
  }
  const r = await desvalidarCedula(a, id, modo, revisionEn, f.get("repetir") === "si");
  return r.ok ? { ok: true } : { ok: false, mensaje: r.mensaje };
}
