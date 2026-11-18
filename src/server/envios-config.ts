import { dentroDeHorario, TOPE_DIARIO, type CanalEnvio } from "../domain/envios-ritmo";
import { normalizarFrase } from "../domain/limpieza";
import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { query, withTx } from "./db";
import { loadEnv } from "./env";
import { clienteCorreo, type ClienteCorreo } from "./envios/brevo";
import { clienteEvolution, type ClienteEvolution } from "./envios/evolution";

// Interruptores del envío real (09 §3.7). Todo nace APAGADO: sin que la superadmin lo encienda no sale nada real.
export const FRASE_ENVIO_REAL = "ENVIO REAL";
export type Clientes = { whatsapp: ClienteEvolution; correo: ClienteCorreo };
export const clientesPorDefecto = (): Clientes => ({ whatsapp: clienteEvolution(), correo: clienteCorreo() });

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function exigirSuperadmin(sesion: Sesion): void {
  if (sesion.tipo !== "superadmin") throw new Error("Solo la superadministración puede hacer esto.");
}

export type ConfigEnvios = {
  whatsappReal: boolean; correoReal: boolean; whatsappNumero: string | null;
  correoRemitente: string | null; correoRemitenteNombre: string | null;
  whatsappProximoEn: string | null; correoProximoEn: string | null; whatsappPausa: string | null; correoPausa: string | null;
};

export async function leerConfigEnvios(): Promise<ConfigEnvios> {
  const f = (await query<{ w: boolean; c: boolean; num: string | null; rem: string | null; nom: string | null; wp: string | null; cp: string | null; wm: string | null; cm: string | null }>(
    `SELECT whatsapp_real AS w, correo_real AS c, whatsapp_numero AS num, correo_remitente AS rem, correo_remitente_nombre AS nom,
            whatsapp_proximo_en::text AS wp, correo_proximo_en::text AS cp, whatsapp_pausa_motivo AS wm, correo_pausa_motivo AS cm FROM configuracion WHERE id = 1`))[0];
  return { whatsappReal: f.w, correoReal: f.c, whatsappNumero: f.num, correoRemitente: f.rem, correoRemitenteNombre: f.nom, whatsappProximoEn: f.wp, correoProximoEn: f.cp, whatsappPausa: f.wm, correoPausa: f.cm };
}

// Dirección efectiva del remitente: la guardada o, si no hay, la verificada de consulares (MAIL_FROM_ADDRESS).
export function remitenteEfectivo(c: Pick<ConfigEnvios, "correoRemitente" | "correoRemitenteNombre">): { direccion: string; nombre: string } {
  loadEnv();
  return { direccion: (c.correoRemitente || process.env.MAIL_FROM_ADDRESS || "").trim(), nombre: (c.correoRemitenteNombre ?? "").trim() };
}

export const canalEnReal = async (canal: CanalEnvio): Promise<boolean> => {
  const c = await leerConfigEnvios();
  return canal === "whatsapp" ? c.whatsappReal : c.correoReal;
};

// Lo que impide encender el canal, en orden. Vacío = se puede.
export async function impedimentos(canal: CanalEnvio, clientes: Clientes = clientesPorDefecto()): Promise<string[]> {
  loadEnv();
  const c = await leerConfigEnvios();
  const falta: string[] = [];
  if (!process.env.HOST_MADRID?.trim()) falta.push("Falta HOST_MADRID: el enlace del mensaje no se puede armar.");
  if (canal === "whatsapp") {
    if (clientes.whatsapp.simulado) falta.push("Falta la clave de Evolution API en el servidor.");
    else {
      try {
        if ((await clientes.whatsapp.resumen()).estado !== "open") falta.push("La línea de WhatsApp no está vinculada.");
      } catch {
        falta.push("No se pudo comprobar la línea de WhatsApp.");
      }
    }
  } else {
    if (clientes.correo.simulado) falta.push("Falta la clave de Brevo en el servidor.");
    const r = remitenteEfectivo(c);
    if (!EMAIL.test(r.direccion)) falta.push("Falta la dirección del remitente del correo.");
    if (!r.nombre) falta.push("Falta el nombre del remitente del correo.");
  }
  return falta;
}

export async function cambiarInterruptor(sesion: Sesion, canal: CanalEnvio, encender: boolean, confirmacion: string, clientes: Clientes = clientesPorDefecto()): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  exigirSuperadmin(sesion);
  if (encender) {
    if (normalizarFrase(confirmacion) !== FRASE_ENVIO_REAL) return { ok: false, mensaje: `Escriba «${FRASE_ENVIO_REAL}» para encender el envío real.` };
    const falta = await impedimentos(canal, clientes);
    if (falta.length) return { ok: false, mensaje: `No se puede encender: ${falta.join(" ")}` };
  }
  const col = canal === "whatsapp" ? "whatsapp_real" : "correo_real";
  await withTx(async (client) => {
    await client.query(`UPDATE configuracion SET ${col} = $1, actualizado_en = now(), actualizado_por = $2 WHERE id = 1`, [encender, sesion.usuarioId]);
    await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: encender ? "envio_real_encendido" : "envio_real_apagado", entidad: "configuracion", entidadId: 1, datos: { canal } }, client);
  });
  return { ok: true };
}

// Tras una pausa por fallos seguidos solo la superadmin reanuda. El contador de fallos vuelve a cero desde este momento.
export async function reanudarEnvios(sesion: Sesion, canal: CanalEnvio): Promise<void> {
  exigirSuperadmin(sesion);
  const col = canal === "whatsapp" ? "whatsapp_pausa_motivo" : "correo_pausa_motivo";
  await withTx(async (client) => {
    await client.query(`UPDATE configuracion SET ${col} = NULL, actualizado_en = now(), actualizado_por = $1 WHERE id = 1`, [sesion.usuarioId]);
    await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "envios_reanudados", entidad: "configuracion", entidadId: 1, datos: { canal } }, client);
  });
}

export async function guardarRemitente(sesion: Sesion, direccion: string, nombre: string): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  exigirSuperadmin(sesion);
  const d = direccion.trim().toLowerCase(), n = nombre.trim();
  if (!EMAIL.test(d) || d.length > 200) return { ok: false, mensaje: "Escriba una dirección de correo válida (debe estar verificada en Brevo)." };
  if (n.length < 2 || n.length > 70) return { ok: false, mensaje: "Escriba el nombre del remitente (hasta 70 letras)." };
  await withTx(async (client) => {
    await client.query("UPDATE configuracion SET correo_remitente = $1, correo_remitente_nombre = $2, actualizado_en = now(), actualizado_por = $3 WHERE id = 1", [d, n, sesion.usuarioId]);
    await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "remitente_correo_guardado", entidad: "configuracion", entidadId: 1, datos: { direccion: d, nombre: n } }, client);
  });
  return { ok: true };
}

export type EstadoCanal = { enCola: number; enviadosHoy: number; fallidos: number; proximoEn: string | null; pausa: string | null; tope: number; dentroDeHorario: boolean };

// Inicio del día de Madrid de `ahora`, para contar «hoy». Se calcula en SQL con la zona horaria.
export const INICIO_DIA_MADRID = "(date_trunc('day', $2::timestamptz AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid')";

export async function estadoCola(ahora: Date = new Date()): Promise<Record<CanalEnvio, EstadoCanal>> {
  const c = await leerConfigEnvios();
  const salida = {} as Record<CanalEnvio, EstadoCanal>;
  for (const canal of ["whatsapp", "correo"] as const) {
    const f = (await query<{ cola: number; hoy: number; fallos: number }>(
      `SELECT count(*) FILTER (WHERE estado = 'en_cola' AND NOT simulado)::int AS cola,
              count(*) FILTER (WHERE estado = 'enviada_al_servicio' AND NOT simulado AND enviado_en >= ${INICIO_DIA_MADRID})::int AS hoy,
              count(*) FILTER (WHERE estado = 'fallo' AND NOT simulado)::int AS fallos
         FROM envios_credencial WHERE canal = $1`, [canal, ahora.toISOString()]))[0];
    salida[canal] = {
      enCola: f.cola, enviadosHoy: f.hoy, fallidos: f.fallos, tope: TOPE_DIARIO[canal], dentroDeHorario: dentroDeHorario(ahora),
      proximoEn: canal === "whatsapp" ? c.whatsappProximoEn : c.correoProximoEn, pausa: canal === "whatsapp" ? c.whatsappPausa : c.correoPausa,
    };
  }
  return salida;
}
