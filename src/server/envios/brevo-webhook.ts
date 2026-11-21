import { createHmac, timingSafeEqual } from "node:crypto";
import { masterKey } from "../crypto";
import { query } from "../db";

export function claveWebhookBrevo(): string {
  return createHmac("sha256", masterKey()).update("cne-madrid/brevo-webhook/v1").digest("base64url");
}

export function webhookBrevoAutorizado(header: string | null): boolean {
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(header ?? "");
  return !!m && timingSafeEqual(Buffer.from(m[1]), Buffer.from(claveWebhookBrevo()));
}

const EVENTOS = {
  request: "aceptado", sent: "aceptado", requests: "aceptado",
  deferred: "diferido", delivered: "entregado",
  hard_bounce: "rebote_permanente", hardBounces: "rebote_permanente",
  soft_bounce: "rebote_temporal", softBounces: "rebote_temporal",
  blocked: "bloqueado", invalid_email: "invalido", invalid: "invalido",
  spam: "spam", error: "error",
} as const;

export type EstadoBrevo = (typeof EVENTOS)[keyof typeof EVENTOS];

export const etiquetaEnvioBrevo = (id: number) => `cne-madrid-envio-${id}`;

export async function registrarEventoBrevo(cuerpo: unknown, historico = false): Promise<boolean> {
  if (!cuerpo || typeof cuerpo !== "object") return false;
  const e = cuerpo as Record<string, unknown>;
  if (typeof e.event !== "string" || !Object.hasOwn(EVENTOS, e.event)) return false;
  const estado = EVENTOS[e.event as keyof typeof EVENTOS];
  const mensaje = historico ? e.messageId : e["message-id"];
  if (typeof e.email !== "string" || e.email.length > 254 || typeof mensaje !== "string" || mensaje.length > 200) return false;
  const idExterno = mensaje.trim().replace(/^<|>$/g, "");
  if (!idExterno) return false;

  const segundos = e.ts_event ?? e.ts;
  const ms = historico && typeof e.date === "string" ? Date.parse(e.date) : typeof segundos === "number" ? segundos * 1000 : NaN;
  if (!Number.isFinite(ms) || ms < 0 || ms > Date.now() + 86400000) return false;
  const etiquetas: unknown[] = Array.isArray(e.tags) ? [...e.tags, e.tag] : [e.tag];
  const tag = etiquetas.find((t): t is string => typeof t === "string" && /^cne-madrid-envio-[1-9]\d{0,15}$/.test(t));
  const idEnvio = tag?.slice("cne-madrid-envio-".length) ?? null;

  const actualizadas = await query(
    `UPDATE envios_credencial
        SET brevo_estado = $3, brevo_evento_en = $4, id_externo = coalesce(id_externo, $1)
      WHERE canal = 'correo' AND NOT simulado AND mjrv_id IS NOT NULL AND lower(destino) = $2
        AND (btrim(id_externo, '<>') = $1 OR (id = $5 AND intentos > 0 AND id_externo IS NULL))
        AND (
          brevo_evento_en IS NULL
          OR ($3 <> 'aceptado' AND (brevo_estado = 'aceptado' OR (
            ($3 <> 'diferido' OR brevo_estado = 'diferido')
            AND ($4 > brevo_evento_en OR ($4 = brevo_evento_en AND (
              brevo_estado = 'diferido' AND $3 <> 'diferido' OR $3 = 'entregado' AND brevo_estado <> 'entregado'
            )))
          )))
        )
      RETURNING id`, [idExterno, e.email.trim().toLowerCase(), estado, new Date(ms), idEnvio],
  );
  return actualizadas.length > 0;
}
