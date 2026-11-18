"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "./guard";
import { enviarCredencial, enviarLote } from "./envios";
import type { Canal } from "./envios/proveedor";

export type EstadoEnvios = { error?: string; aviso?: string } | null;
const canal = (f: FormData): Canal => (f.get("canal") === "correo" ? "correo" : "whatsapp");
const NOTA = " (simulado: no salió ningún mensaje)";

export async function enviarCredencialAccion(_: EstadoEnvios, f: FormData): Promise<EstadoEnvios> {
  const sesion = await requireAdmin();
  const id = Number(f.get("id"));
  const r = await enviarCredencial(sesion, id, canal(f));
  revalidatePath(`/admin/mjrv/${id}`);
  if (!r.ok) return { error: r.mensaje };
  if (r.enCola) return { aviso: "En cola: saldrá poco a poco, con pausas entre mensajes y en horario de 9 a 21 h." };
  return { aviso: `Enviada al servicio${r.simulado ? NOTA : ""}.` };
}

export async function enviarLoteAccion(_: EstadoEnvios, f: FormData): Promise<EstadoEnvios> {
  const sesion = await requireAdmin();
  const r = await enviarLote(sesion, canal(f));
  revalidatePath("/admin/credenciales");
  if ("error" in r) return { error: r.error };
  if (r.enCola > 0) return { aviso: `${r.enCola} en cola (saldrán poco a poco, con pausas y de 9 a 21 h), ${r.omitidas} omitidas (sin dato válido o sin rótulo), ${r.fallidas} con fallo.` };
  return { aviso: `${r.enviadas} enviadas al servicio, ${r.omitidas} omitidas (sin dato válido o sin rótulo), ${r.fallidas} con fallo${NOTA}.` };
}
