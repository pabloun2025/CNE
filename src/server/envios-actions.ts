"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./guard";
import { leerIdsCredenciales, seleccionarParaCredencial } from "./credenciales";
import { controlarColaWhatsApp } from "./envios-config";
import { enviarCredencial, enviarLote } from "./envios";
import type { Canal } from "./envios/proveedor";

export type EstadoEnvios = { error?: string; aviso?: string } | null;

const etiquetas: Record<Canal, string> = { whatsapp: "WhatsApp", correo: "Correo" };

function canales(f: FormData): Canal[] {
  const valor = f.get("canal");
  if (valor === "ambos") return ["whatsapp", "correo"];
  return valor === "whatsapp" || valor === "correo" ? [valor] : [];
}

function lineaWhatsApp(f: FormData, seleccion: Canal[]) {
  if (!seleccion.includes("whatsapp")) return 1;
  const valor = f.get("linea");
  if (valor === "1") return 1;
  if (valor === "2") return 2;
  return null;
}

export async function enviarCredencialAccion(_: EstadoEnvios, f: FormData): Promise<EstadoEnvios> {
  const sesion = await requireAdmin();
  const id = Number(f.get("id"));
  const seleccion = canales(f);
  const linea = lineaWhatsApp(f, seleccion);
  if (!Number.isSafeInteger(id) || id < 1 || !seleccion.length) return { error: "Seleccione una ficha y un canal." };

  if (!linea) return { error: "Seleccione el número de WhatsApp que enviará la credencial." };

  const respuestas = await Promise.all(seleccion.map(async (canal) => {
    const r = await enviarCredencial(sesion, id, canal, undefined, f.get("reenviar") === "1", linea);
    const detalle = !r.ok ? r.mensaje : r.enCola ? "En cola." : r.simulado ? "Simulado. No salió ningún mensaje." : "Enviada al servicio.";
    return { ok: r.ok, texto: `${etiquetas[canal]}${canal === "whatsapp" ? ` · Línea ${linea}` : ""} · ${detalle}` };
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
  const linea = lineaWhatsApp(f, medios);
  if (!ids) return { error: "Seleccione al menos una ficha válida." };
  if (!medios.length) return { error: "Seleccione WhatsApp, correo o ambos." };
  if (!linea) return { error: "Seleccione el número de WhatsApp que enviará las credenciales." };
  const seleccion = { alcance: "ids", ids } as const;
  if ((await seleccionarParaCredencial(seleccion)).ids.length !== ids.length) {
    return { error: "La selección cambió. Actualice la lista y vuelva a elegir las fichas." };
  }

  const respuestas = await Promise.all(medios.map(async (canal) => {
    const r = await enviarLote(sesion, canal, undefined, seleccion, f.get("reenviar") === "1", linea);
    return `${etiquetas[canal]}${canal === "whatsapp" ? ` · Línea ${linea}` : ""} · En cola ${r.enCola} · Simuladas ${r.enviadas} · Omitidas ${r.omitidas} · Fallidas ${r.fallidas}.`;
  }));
  revalidatePath("/admin/credenciales");
  if (medios.includes("whatsapp")) revalidatePath("/admin/credenciales/whatsapp");
  const alcance = ids.length === 1 ? "1 ficha seleccionada" : `${ids.length} fichas seleccionadas`;
  return { aviso: `${alcance}. ${respuestas.join(" ")}` };
}


export async function controlarColaWhatsAppAccion(_: EstadoEnvios, f: FormData): Promise<EstadoEnvios> {
  const sesion = await requireAdmin();
  const linea = lineaWhatsApp(f, ["whatsapp"]);
  const accion = f.get("accion");
  if (!linea || (accion !== "pausar" && accion !== "reanudar")) return { error: "Operación no válida." };
  const r = await controlarColaWhatsApp(sesion, linea, accion);
  revalidatePath("/admin/credenciales/whatsapp");
  return r.ok ? { aviso: accion === "pausar" ? "Cola pausada." : "Cola reanudada." } : { error: r.mensaje };
}
