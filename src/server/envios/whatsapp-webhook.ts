import { createHmac, timingSafeEqual } from "node:crypto";
import type { LineaEnvioWhatsApp } from "../../domain/envios-ritmo";
import { encryptBuffer, masterKey } from "../crypto";
import { query } from "../db";
import { instanciaWhatsApp } from "./evolution";

export const CABECERA_WEBHOOK_WHATSAPP = "x-cne-whatsapp-token";

export function credencialWebhookWhatsApp(linea: LineaEnvioWhatsApp): string {
  return createHmac("sha256", masterKey()).update(`cne-madrid/evolution-inbox/v1/${instanciaWhatsApp(linea)}`).digest("base64url");
}

export function lineaWebhookWhatsApp(token: string | null): LineaEnvioWhatsApp | null {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const recibida = Buffer.from(token);
  return ([1, 2] as const).find((linea) => timingSafeEqual(recibida, Buffer.from(credencialWebhookWhatsApp(linea)))) ?? null;
}

type MensajeWebhook = {
  id: string;
  telefono: string;
  recibidoEn: Date;
  texto: string;
};

function objeto(valor: unknown): Record<string, unknown> | null {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null;
}

function telefonoDirecto(jid: unknown): string | null {
  const coincidencia = typeof jid === "string" ? /^([1-9]\d{7,14})(?::\d{1,5})?@s\.whatsapp\.net$/.exec(jid) : null;
  return coincidencia ? `+${coincidencia[1]}` : null;
}

function mensajeEntrante(datos: unknown): MensajeWebhook | null {
  const data = objeto(datos);
  const clave = objeto(data?.key);
  if (clave?.fromMe !== false || typeof clave.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(clave.id)) return null;
  const jid = clave.remoteJid;
  const lid = typeof jid === "string" && /^\d+(?::\d{1,5})?@lid$/.test(jid);
  const telefono = telefonoDirecto(jid) ?? (lid ? telefonoDirecto(clave.remoteJidAlt) : null);
  const contenido = objeto(data?.message);
  const texto = contenido?.conversation ?? objeto(contenido?.extendedTextMessage)?.text;
  const segundos = data?.messageTimestamp;
  if (!telefono || typeof texto !== "string" || !texto.trim() || Buffer.byteLength(texto) > 4000) return null;
  if (typeof segundos !== "number" || !Number.isSafeInteger(segundos) || segundos <= 0 || segundos * 1000 > Date.now() + 86_400_000) return null;
  return { id: clave.id, telefono, recibidoEn: new Date(segundos * 1000), texto };
}

export async function registrarRespuestaWhatsApp(linea: LineaEnvioWhatsApp, datos: unknown): Promise<void> {
  const mensaje = mensajeEntrante(datos);
  if (!mensaje) return;
  const { ciphertext, nonce } = encryptBuffer(Buffer.from(mensaje.texto));

  // Un número compartido no basta para atribuir una respuesta. La cola solo se consulta para dar contexto.
  await query(
    `WITH coincidencias AS (
       SELECT id FROM mjrv WHERE telefono_e164 = $3 AND activo AND NOT es_prueba LIMIT 2
     )
     INSERT INTO whatsapp_respuestas (linea, id_externo, mjrv_id, recibido_en, texto_cifrado, texto_nonce, ultimo_envio_en)
     SELECT $1, $2, c.id, $4, $5, $6, (
       SELECT max(e.enviado_en) FROM envios_credencial e
       WHERE e.mjrv_id = c.id AND e.canal = 'whatsapp' AND e.linea_whatsapp = $1
         AND e.destino = $3 AND NOT e.simulado AND e.estado IN ('enviada_al_servicio', 'entregada')
         AND e.enviado_en < $4::timestamptz + interval '1 second'
     )
       FROM coincidencias c
      WHERE (SELECT count(*) FROM coincidencias) = 1
     ON CONFLICT (linea, id_externo) DO NOTHING`,
    [linea, mensaje.id, mensaje.telefono, mensaje.recibidoEn, ciphertext, nonce],
  );
}
