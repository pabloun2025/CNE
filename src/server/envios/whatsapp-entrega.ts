import type { LineaEnvioWhatsApp } from "../../domain/envios-ritmo";
import { query } from "../db";

export async function registrarEntregaWhatsApp(linea: LineaEnvioWhatsApp, cuerpo: unknown): Promise<boolean> {
  const evento = cuerpo as { data?: { keyId?: unknown; fromMe?: unknown; remoteJid?: unknown; status?: unknown } } | null;
  const dato = evento?.data;
  if (dato?.fromMe !== true || typeof dato.keyId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(dato.keyId)) return false;
  const estado = dato.status === "DELIVERY_ACK" || dato.status === "READ" || dato.status === "PLAYED" ? "entregado"
    : dato.status === "ERROR" ? "error" : null;
  if (!estado || typeof dato.remoteJid !== "string") return false;
  const telefono = /^([1-9]\d{7,14})(?::\d{1,5})?@s\.whatsapp\.net$/.exec(dato.remoteJid);
  if (!telefono && !/^\d+(?::\d{1,5})?@lid$/.test(dato.remoteJid)) return false;

  // Durante el intento, el acuse puede llegar antes del ID externo. El informe exige que ambos IDs coincidan.
  const filas = await query(
    `WITH intento AS (
       SELECT id FROM envios_credencial
        WHERE canal = 'whatsapp' AND linea_whatsapp = $1 AND NOT simulado AND intentos > 0
          AND (id_externo = $2 OR (id_externo IS NULL AND estado = 'en_cola' AND destino = $3))
          AND ($3::text IS NULL OR destino = $3)
        ORDER BY id_externo IS DISTINCT FROM $2, id DESC LIMIT 1
     )
     INSERT INTO entregas_whatsapp (envio_id, id_externo, estado)
      SELECT id, $2, $4 FROM intento
     ON CONFLICT (envio_id, id_externo) DO UPDATE SET estado = excluded.estado, evento_en = excluded.evento_en
      WHERE entregas_whatsapp.estado = 'error' AND excluded.estado = 'entregado'
     RETURNING envio_id`, [linea, dato.keyId, telefono ? `+${telefono[1]}` : null, estado],
  );
  return filas.length > 0;
}
