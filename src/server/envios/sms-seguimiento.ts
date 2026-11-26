import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { masterKey } from "../crypto";
import { query } from "../db";

const formatoIdExterno = /^[A-Za-z0-9_-]{1,32}$/;
const formatoTelefono = /^\+?[1-9]\d{7,14}$/;
const firma = (id: number) => createHmac("sha256", masterKey()).update(`cne/madrid/smspubli/acuse/v1/${id}`).digest("base64url");

export function hashEnlaceSms(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function urlAcuseSms(host: string, id: number): string {
  const url = new URL(`https://${host}/api/webhooks/smspubli`);
  url.searchParams.set("envio", String(id));
  url.searchParams.set("firma", firma(id));
  return url.toString();
}

export function envioAcuseSmsAutorizado(url: URL): number | null {
  const envio = url.searchParams.get("envio") ?? "";
  const recibida = url.searchParams.get("firma") ?? "";
  if (!/^[1-9]\d{0,15}$/.test(envio) || !/^[A-Za-z0-9_-]{43}$/.test(recibida)) return null;
  const id = Number(envio);
  if (!Number.isSafeInteger(id)) return null;
  return timingSafeEqual(Buffer.from(recibida), Buffer.from(firma(id))) ? id : null;
}

export async function registrarAperturaSms(token: string, mjrvId: number): Promise<void> {
  await query(
    `UPDATE envios_sms SET abierto_en = now()
       WHERE token_hash = $1 AND mjrv_id = $2 AND abierto_en IS NULL`,
    [hashEnlaceSms(token), mjrvId],
  );
}

const estados = {
  ACCEPTD: "aceptado", DELIVRD: "entregado", EXPIRED: "fallo",
  DELETED: "fallo", UNDELIV: "fallo", REJECTD: "fallo",
} as const;

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

function telefono(valor: unknown): string | null {
  return typeof valor === "string" && formatoTelefono.test(valor) ? `+${valor.replace(/^\+/, "")}` : null;
}

export async function registrarAcusesSms(envio: number, cuerpo: unknown): Promise<void> {
  if (Array.isArray(cuerpo)) {
    for (const elemento of cuerpo) {
      const evento = objeto(elemento);
      const destino = telefono(evento.to);
      if (!destino || typeof evento.sms_id !== "string" || !formatoIdExterno.test(evento.sms_id) ||
          typeof evento.status !== "string" || !Object.hasOwn(estados, evento.status) ||
          (evento.custom && evento.custom !== `CNESMS${envio}`)) continue;
      const estado = estados[evento.status as keyof typeof estados];
      await query(
        `UPDATE envios_sms SET id_externo = coalesce(id_externo, $2), estado = $4, codigo_error = $5, actualizado_en = now()
           WHERE id = $1 AND destino = $3
             AND (id_externo = $2 OR (id_externo IS NULL AND estado IN ('reservado', 'incierto')))
             AND (estado <> $4 OR id_externo IS NULL)
             AND (estado <> 'entregado' AND (estado <> 'fallo' OR $4 = 'entregado'))`,
        [envio, evento.sms_id, destino, estado, estado === "fallo" ? evento.status : null],
      );
    }
    return;
  }

  for (const [externo, contenido] of Object.entries(objeto(cuerpo))) {
    const evento = objeto(contenido);
    const destino = telefono(evento.msisdn);
    if (!destino || !formatoIdExterno.test(externo) || typeof evento.timestamp !== "string") continue;
    await query(
      `UPDATE envios_sms SET clic_en = now(), id_externo = coalesce(id_externo, $2)
         WHERE id = $1 AND destino = $3 AND clic_en IS NULL
           AND (id_externo = $2 OR (id_externo IS NULL AND estado IN ('reservado', 'incierto')))`,
      [envio, externo, destino],
    );
  }
}
