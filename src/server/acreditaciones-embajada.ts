import { createHash } from "node:crypto";
import { query } from "./db";

export const BASE_ACREDITACION_EMBAJADA = "https://madrid.consulado.app/v/";
export const TOKEN_ACREDITACION_EMBAJADA = /^[A-Za-z0-9_-]{32}$/;

export function hashAcreditacionEmbajada(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function buscarAcreditacionEmbajada(token: string) {
  if (!TOKEN_ACREDITACION_EMBAJADA.test(token)) return null;
  const [ficha] = await query<{ nombre: string; cargo: string; revocada: boolean }>(
    "SELECT nombre, cargo, revocada_en IS NOT NULL AS revocada FROM acreditaciones_embajada WHERE token_hash = $1",
    [hashAcreditacionEmbajada(token)],
  );
  return ficha ?? null;
}
