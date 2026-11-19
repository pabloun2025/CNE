"use server";

import { revalidatePath } from "next/cache";
import { leerJunta, ZONAS } from "../domain/juntas";
import { requireAdmin } from "./guard";
import type { Seleccion } from "./credenciales";
import { enviarCredencial, enviarLote } from "./envios";
import type { Canal } from "./envios/proveedor";

export type EstadoEnvios = { error?: string; aviso?: string } | null;

const etiquetas: Record<Canal, string> = { whatsapp: "WhatsApp", correo: "Correo" };

function canales(f: FormData): Canal[] {
  const valor = f.get("canal");
  if (valor === "ambos") return ["whatsapp", "correo"];
  return valor === "whatsapp" || valor === "correo" ? [valor] : [];
}

function seleccionar(f: FormData): Seleccion | undefined {
  const alcance = f.get("alcance");
  const valor = String(f.get("valor") ?? "").trim();
  if (alcance === "todas") return { alcance };
  if (alcance === "junta" && leerJunta(valor)) return { alcance, valor };
  if (alcance === "zona" && ZONAS.some((zona) => zona === valor)) return { alcance, valor };
  if (alcance === "ids") {
    const ids = [...new Set(f.getAll("ids").map(Number))].filter((id) => Number.isSafeInteger(id) && id > 0);
    if (ids.length) return { alcance, ids };
  }
}

export async function enviarCredencialAccion(_: EstadoEnvios, f: FormData): Promise<EstadoEnvios> {
  const sesion = await requireAdmin();
  const id = Number(f.get("id"));
  const seleccion = canales(f);
  if (!Number.isSafeInteger(id) || id < 1 || !seleccion.length) return { error: "Seleccione una ficha y un canal." };

  const respuestas = await Promise.all(seleccion.map(async (canal) => {
    const r = await enviarCredencial(sesion, id, canal);
    const detalle = !r.ok ? r.mensaje : r.enCola ? "En cola." : r.simulado ? "Simulado. No salió ningún mensaje." : "Enviada al servicio.";
    return { ok: r.ok, texto: `${etiquetas[canal]} · ${detalle}` };
  }));
  revalidatePath(`/admin/mjrv/${id}`);
  revalidatePath("/admin/credenciales");
  const mensaje = respuestas.map((r) => r.texto).join(" ");
  return respuestas.some((r) => r.ok) ? { aviso: mensaje } : { error: mensaje };
}

export async function enviarLoteAccion(_: EstadoEnvios, f: FormData): Promise<EstadoEnvios> {
  const sesion = await requireAdmin();
  const seleccion = seleccionar(f);
  const medios = canales(f);
  if (!seleccion) return { error: "Seleccione las fichas, una junta válida o una zona." };
  if (!medios.length) return { error: "Seleccione WhatsApp, correo o ambos." };

  const respuestas = await Promise.all(medios.map(async (canal) => {
    const r = await enviarLote(sesion, canal, undefined, seleccion);
    if (r.intentadas === 0) return `${etiquetas[canal]} · No hay credenciales pendientes con un contacto para este canal.`;
    return `${etiquetas[canal]} · ${r.enCola} en cola, ${r.enviadas} simuladas, ${r.omitidas} omitidas y ${r.fallidas} fallidas.`;
  }));
  revalidatePath("/admin/credenciales");
  return { aviso: respuestas.join(" ") };
}
