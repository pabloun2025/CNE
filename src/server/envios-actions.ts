"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./guard";
import { leerIdsCredenciales, seleccionarParaCredencial } from "./credenciales";
import { enviarCredencial, enviarLote } from "./envios";
import type { Canal } from "./envios/proveedor";

export type EstadoEnvios = { error?: string; aviso?: string } | null;

const etiquetas: Record<Canal, string> = { whatsapp: "WhatsApp", correo: "Correo" };

function canales(f: FormData): Canal[] {
  const valor = f.get("canal");
  if (valor === "ambos") return ["whatsapp", "correo"];
  return valor === "whatsapp" || valor === "correo" ? [valor] : [];
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
  const ids = leerIdsCredenciales(f.getAll("ids"));
  const medios = canales(f);
  if (!ids) return { error: "Seleccione al menos una ficha válida." };
  if (!medios.length) return { error: "Seleccione WhatsApp, correo o ambos." };
  const seleccion = { alcance: "ids", ids } as const;
  if ((await seleccionarParaCredencial(seleccion)).ids.length !== ids.length) {
    return { error: "La selección cambió. Actualice la lista y vuelva a elegir las fichas." };
  }

  const respuestas = await Promise.all(medios.map(async (canal) => {
    const r = await enviarLote(sesion, canal, undefined, seleccion);
    return `${etiquetas[canal]} · En cola ${r.enCola} · Simuladas ${r.enviadas} · Omitidas ${r.omitidas} · Fallidas ${r.fallidas}.`;
  }));
  revalidatePath("/admin/credenciales");
  const alcance = ids.length === 1 ? "1 ficha seleccionada" : `${ids.length} fichas seleccionadas`;
  return { aviso: `${alcance}. ${respuestas.join(" ")}` };
}
