"use server";

import { CONSUL_Y_COORDINADOR } from "../domain/roles";
import { adminOEstacionApi } from "./guard";
import { incorporarVotante } from "./incorporar";
import { aceptarPropuesta, asignarCargo, descartarPropuesta, quitarCargo, marcarNoDisponible, moverManual, quitarExcepcion, rehabilitar, type Actor, type Resultado } from "./movimientos";

// Solo administración Madrid o una estación con función «mando». Cada acción lo comprueba en el servidor.
async function actor(): Promise<Actor | null> {
  const s = await adminOEstacionApi(["mando"], CONSUL_Y_COORDINADOR);
  if (!s) return null;
  return s.tipo === "admin" ? { tipo: "madrid_admin", id: s.sesion.usuarioId, nombre: s.sesion.nombre } : { tipo: "operador", id: s.sesion.operadorId, nombre: s.sesion.operadorNombre };
}
const NO_AUT: Resultado = { ok: false, mensaje: "Su sesión ya no es válida. Vuelva a identificarse." };
const num = (f: FormData, k: string) => Number(f.get(k));
const propuesta = (f: FormData) => ({ mjrvId: num(f, "mjrvId"), origenId: num(f, "origenId"), destinoId: num(f, "destinoId"), cargo: String(f.get("cargo") ?? "") });

export async function aceptarAccion(f: FormData): Promise<Resultado> {
  const a = await actor();
  return a ? aceptarPropuesta(a, propuesta(f)) : NO_AUT;
}
export async function pasarAccion(f: FormData): Promise<Resultado> {
  const a = await actor();
  return a ? descartarPropuesta(a, propuesta(f), "pasada") : NO_AUT;
}
export async function noViableAccion(f: FormData): Promise<Resultado> {
  const a = await actor();
  return a ? descartarPropuesta(a, propuesta(f), "no_viable", String(f.get("motivo") ?? "")) : NO_AUT;
}
export async function moverManualAccion(f: FormData): Promise<Resultado> {
  const a = await actor();
  return a ? moverManual(a, { mjrvId: num(f, "mjrvId"), destino: String(f.get("destino") ?? ""), confirmar: f.get("confirmar") === "1", cargo: String(f.get("cargo") ?? "") }) : NO_AUT;
}
export async function excepcionAccion(f: FormData): Promise<Resultado> {
  const a = await actor();
  if (!a) return NO_AUT;
  return f.get("quitar") === "1" ? quitarExcepcion(num(f, "mjrvId")) : marcarNoDisponible(a, num(f, "mjrvId"), String(f.get("motivo") ?? ""));
}
export async function rehabilitarAccion(f: FormData): Promise<Resultado> {
  const a = await actor();
  return a ? rehabilitar(num(f, "mjrvId")) : NO_AUT;
}

export async function asignarCargoAccion(f: FormData): Promise<Resultado> {
  const a = await actor();
  return a ? asignarCargo(a, { juntaId: num(f, "juntaId"), mjrvId: num(f, "mjrvId"), cargo: String(f.get("cargo") ?? "") }) : NO_AUT;
}
export async function quitarCargoAccion(f: FormData): Promise<Resultado> {
  const a = await actor();
  return a ? quitarCargo(a, { juntaId: num(f, "juntaId"), mjrvId: num(f, "mjrvId") }) : NO_AUT;
}

export async function incorporarVotanteAccion(f: FormData): Promise<Resultado> {
  const a = await actor();
  const t = (k: string) => String(f.get(k) ?? "");
  return a ? incorporarVotante(a, { nombres: t("nombres"), apellidos: t("apellidos"), cedula: t("cedula"), juntaId: num(f, "juntaId"), cargo: t("cargo"), telefono: t("telefono"), correo: t("correo") }) : NO_AUT;
}
