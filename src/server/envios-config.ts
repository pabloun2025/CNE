import { z } from "zod";
import { PAUSA_MANUAL_WHATSAPP, type CanalEnvio, type LineaEnvioWhatsApp } from "../domain/envios-ritmo";
import { normalizarFrase } from "../domain/limpieza";
import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { query, withTx } from "./db";
import { loadEnv } from "./env";
import { clienteCorreo, type ClienteCorreo } from "./envios/brevo";
import { clienteEvolution, type ClienteEvolution } from "./envios/evolution";

// Interruptores del envío real (09 §3.7). Todo nace APAGADO: sin que la superadmin lo encienda no sale nada real.
export const FRASE_ENVIO_REAL = "ENVIO REAL";
export type Clientes = { whatsapp: ClienteEvolution; whatsapp2?: ClienteEvolution; correo: ClienteCorreo };
export const clientesPorDefecto = () => ({ whatsapp: clienteEvolution(), whatsapp2: clienteEvolution({ linea: 2 }), correo: clienteCorreo() });

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DIRECCION_RESPUESTA = z.email().max(200);
function exigirSuperadmin(sesion: Sesion): void {
  if (sesion.tipo !== "superadmin") throw new Error("Solo la superadministración puede hacer esto.");
}

export type ConfigEnvios = {
  whatsappReal: boolean; whatsappNumero: string | null; whatsappProximoEn: string | null; whatsappPausa: string | null;
  whatsappReal2: boolean; whatsappNumero2: string | null; whatsappProximoEn2: string | null; whatsappPausa2: string | null;
  correoReal: boolean; correoPausa: string | null;
  correoRemitente: string | null; correoRemitenteNombre: string | null; correoReplyTo: string | null;
};

export async function leerConfigEnvios(): Promise<ConfigEnvios> {
  const [config] = await query<ConfigEnvios>(
    `SELECT whatsapp_real AS "whatsappReal", whatsapp_numero AS "whatsappNumero",
            whatsapp_proximo_en::text AS "whatsappProximoEn", whatsapp_pausa_motivo AS "whatsappPausa",
            whatsapp_real_2 AS "whatsappReal2", whatsapp_numero_2 AS "whatsappNumero2",
            whatsapp_proximo_en_2::text AS "whatsappProximoEn2", whatsapp_pausa_motivo_2 AS "whatsappPausa2",
            correo_real AS "correoReal", correo_pausa_motivo AS "correoPausa", correo_remitente AS "correoRemitente",
            correo_remitente_nombre AS "correoRemitenteNombre", correo_reply_to AS "correoReplyTo"
       FROM configuracion WHERE id = 1`);
  return config;
}

// Dirección efectiva del remitente: la guardada o, si no hay, la verificada de consulares (MAIL_FROM_ADDRESS).
export function remitenteEfectivo(c: Pick<ConfigEnvios, "correoRemitente" | "correoRemitenteNombre">): { direccion: string; nombre: string } {
  loadEnv();
  return { direccion: (c.correoRemitente || process.env.MAIL_FROM_ADDRESS || "").trim(), nombre: (c.correoRemitenteNombre ?? "").trim() };
}

export const canalEnReal = async (canal: CanalEnvio, linea: LineaEnvioWhatsApp = 1): Promise<boolean> => {
  const c = await leerConfigEnvios();
  if (canal === "correo") return c.correoReal;
  return linea === 2 ? c.whatsappReal2 : c.whatsappReal;
};

// Lo que impide encender el canal, en orden. Vacío = se puede.
export async function impedimentos(canal: CanalEnvio, clientes: Clientes = clientesPorDefecto(), linea: LineaEnvioWhatsApp = 1): Promise<string[]> {
  loadEnv();
  const c = await leerConfigEnvios();
  const falta: string[] = [];
  if (!process.env.HOST_MADRID?.trim()) falta.push("Falta HOST_MADRID: el enlace del mensaje no se puede armar.");
  if (canal === "whatsapp") {
    const whatsapp = linea === 2 ? clientes.whatsapp2 : clientes.whatsapp;
    if (!whatsapp || whatsapp.simulado) falta.push("Falta la clave de Evolution API en el servidor.");
    else {
      try {
        if ((await whatsapp.resumen()).estado !== "open") falta.push("La línea de WhatsApp no está vinculada.");
      } catch {
        falta.push("No se pudo comprobar la línea de WhatsApp.");
      }
    }
  } else {
    if (clientes.correo.simulado) falta.push("Falta la clave de Brevo en el servidor.");
    const r = remitenteEfectivo(c);
    if (!EMAIL.test(r.direccion)) falta.push("Falta la dirección del remitente del correo.");
    else if (!clientes.correo.simulado) {
      try {
        if (!(await clientes.correo.verificarRemitente(r.direccion))) falta.push("La dirección no es un remitente activo en Brevo.");
      } catch {
        falta.push("No se pudo verificar el remitente en Brevo. Revise la clave y la conexión.");
      }
    }
    if (!r.nombre) falta.push("Falta el nombre del remitente del correo.");
  }
  return falta;
}

export async function cambiarInterruptor(sesion: Sesion, canal: CanalEnvio, encender: boolean, confirmacion: string, clientes: Clientes = clientesPorDefecto(), linea: LineaEnvioWhatsApp = 1): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  exigirSuperadmin(sesion);
  if (encender) {
    if (normalizarFrase(confirmacion) !== FRASE_ENVIO_REAL) return { ok: false, mensaje: `Escriba «${FRASE_ENVIO_REAL}» para encender el envío real.` };
    const falta = await impedimentos(canal, clientes, linea);
    if (falta.length) return { ok: false, mensaje: `No se puede encender: ${falta.join(" ")}` };
  }
  const segunda = canal === "whatsapp" && linea === 2;
  const col = segunda ? "whatsapp_real_2" : canal === "whatsapp" ? "whatsapp_real" : "correo_real";
  const datos = segunda ? { canal, linea } : { canal };
  await withTx(async (client) => {
    await client.query(`UPDATE configuracion SET ${col} = $1, actualizado_en = now(), actualizado_por = $2 WHERE id = 1`, [encender, sesion.usuarioId]);
    await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: encender ? "envio_real_encendido" : "envio_real_apagado", entidad: "configuracion", entidadId: 1, datos }, client);
  });
  return { ok: true };
}

// Tras una pausa por fallos seguidos solo la superadmin reanuda. El contador de fallos vuelve a cero desde este momento.
export async function reanudarEnvios(sesion: Sesion, canal: CanalEnvio, linea: LineaEnvioWhatsApp = 1): Promise<void> {
  exigirSuperadmin(sesion);
  const segunda = canal === "whatsapp" && linea === 2;
  const col = segunda ? "whatsapp_pausa_motivo_2" : canal === "whatsapp" ? "whatsapp_pausa_motivo" : "correo_pausa_motivo";
  const datos = segunda ? { canal, linea } : { canal };
  await withTx(async (client) => {
    await client.query(`UPDATE configuracion SET ${col} = NULL, actualizado_en = now(), actualizado_por = $1 WHERE id = 1`, [sesion.usuarioId]);
    await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "envios_reanudados", entidad: "configuracion", entidadId: 1, datos }, client);
  });
}

export async function controlarColaWhatsApp(sesion: Sesion, linea: LineaEnvioWhatsApp, accion: "pausar" | "reanudar"): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  if (sesion.tipo !== "madrid_admin" || sesion.rol !== "consul") throw new Error("Solo el cónsul puede controlar la cola de WhatsApp.");
  const columna = linea === 2 ? "whatsapp_pausa_motivo_2" : "whatsapp_pausa_motivo";
  return withTx(async (client) => {
    const r = await client.query(
      `UPDATE configuracion SET ${columna} = $1, actualizado_en = now(), actualizado_por = $2
         WHERE id = 1 AND ($3 AND ${columna} IS NULL OR NOT $3 AND ${columna} = $4)`,
      [accion === "pausar" ? PAUSA_MANUAL_WHATSAPP : null, sesion.usuarioId, accion === "pausar", PAUSA_MANUAL_WHATSAPP],
    );
    if (!r.rowCount) return { ok: false, mensaje: "El estado de la línea cambió. Actualice el panel." };
    await registrarAuditoria({ portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre,
      accion: accion === "pausar" ? "envios_pausados" : "envios_reanudados", entidad: "configuracion", entidadId: 1, datos: { canal: "whatsapp", linea } }, client);
    return { ok: true };
  });
}

export async function guardarRemitente(sesion: Sesion, direccion: string, nombre: string, responderA?: string): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  exigirSuperadmin(sesion);
  const d = direccion.trim().toLowerCase(), n = nombre.trim();
  const respuesta = responderA?.trim().toLowerCase();
  if (!EMAIL.test(d) || d.length > 200) return { ok: false, mensaje: "Escriba una dirección de correo válida (debe estar verificada en Brevo)." };
  if (n.length < 2 || n.length > 70) return { ok: false, mensaje: "Escriba el nombre del remitente (hasta 70 letras)." };
  if (respuesta && !DIRECCION_RESPUESTA.safeParse(respuesta).success) return { ok: false, mensaje: "Escriba una dirección válida para recibir respuestas." };
  await withTx(async (client) => {
    await client.query(`UPDATE configuracion SET correo_remitente = $1, correo_remitente_nombre = $2,
      correo_reply_to = CASE WHEN $3::text IS NULL THEN correo_reply_to ELSE nullif($3, '') END,
      actualizado_en = now(), actualizado_por = $4 WHERE id = 1`, [d, n, respuesta ?? null, sesion.usuarioId]);
    await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "remitente_correo_guardado", entidad: "configuracion", entidadId: 1, datos: { direccion: d, nombre: n, ...(respuesta === undefined ? {} : { responderA: respuesta || null }) } }, client);
  });
  return { ok: true };
}

export type EstadoCanal = { enCola: number; enviadosHoy: number; fallidos: number; proximoEn: string | null; pausa: string | null };

// Inicio del día de Madrid de `ahora`, para contar «hoy». Se calcula en SQL con la zona horaria.
export const INICIO_DIA_MADRID = "(date_trunc('day', $2::timestamptz AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid')";

export async function estadoCola(ahora: Date = new Date()): Promise<Record<CanalEnvio | "whatsapp2", EstadoCanal>> {
  const c = await leerConfigEnvios();
  const canales = [
    { id: "whatsapp", canal: "whatsapp", linea: 1, proximoEn: c.whatsappProximoEn, pausa: c.whatsappPausa },
    { id: "whatsapp2", canal: "whatsapp", linea: 2, proximoEn: c.whatsappProximoEn2, pausa: c.whatsappPausa2 },
    { id: "correo", canal: "correo", linea: null, proximoEn: null, pausa: c.correoPausa },
  ] as const;
  const salida = {} as Record<CanalEnvio | "whatsapp2", EstadoCanal>;
  for (const { id, canal, linea, proximoEn, pausa } of canales) {
    const f = (await query<{ cola: number; hoy: number; fallos: number }>(
      `SELECT count(*) FILTER (WHERE estado = 'en_cola' AND NOT simulado)::int AS cola,
              count(*) FILTER (WHERE (estado = 'enviada_al_servicio' OR brevo_estado IS NOT NULL) AND NOT simulado AND coalesce(enviado_en, brevo_evento_en) >= ${INICIO_DIA_MADRID})::int AS hoy,
              count(*) FILTER (WHERE estado = 'fallo' AND brevo_estado IS NULL AND NOT simulado)::int AS fallos
         FROM envios_credencial WHERE canal = $1 AND ($3::smallint IS NULL OR linea_whatsapp = $3)`, [canal, ahora.toISOString(), linea]))[0];
    salida[id] = { enCola: f.cola, enviadosHoy: f.hoy, fallidos: f.fallos, proximoEn, pausa };
  }
  return salida;
}
