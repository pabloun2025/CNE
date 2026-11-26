"use server";

import { revalidatePath } from "next/cache";
import { confirmarEnviosSms, prepararEnviosSms, type VistaEnviosSms } from "./envios/sms-modulo";
import { requireAdmin } from "./guard";

export type EstadoEnviosSms = VistaEnviosSms | { aviso: string } | { error: string } | null;

export async function enviarSmsAccion(_: EstadoEnviosSms, datos: FormData): Promise<EstadoEnviosSms> {
  const sesion = await requireAdmin();
  const ids = datos.getAll("ids").map((id) => typeof id === "string" && /^[1-9]\d{0,15}$/.test(id) ? Number(id) : 0);
  const intencion = datos.get("intencion");
  if (intencion === "revisar") return prepararEnviosSms(sesion, ids);

  const confirmacion = datos.get("revision");
  if (intencion !== "enviar" || datos.get("confirmar") !== "1" || typeof confirmacion !== "string") {
    return { error: "Revise los SMS y marque la confirmación antes de enviarlos." };
  }
  const resultado = await confirmarEnviosSms(sesion, ids, confirmacion);
  revalidatePath("/admin/credenciales/sms");
  revalidatePath("/admin/credenciales/envios");
  if ("error" in resultado) return resultado;

  const { aceptado, entregado, fallo, incierto, pendientes } = resultado;
  return { aviso: `${aceptado} aceptados por SMS Publi · ${entregado} entregados · ${fallo} fallidos · ${incierto} inciertos · ${pendientes} sin tramitar en esta solicitud.` };
}
