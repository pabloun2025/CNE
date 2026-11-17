import type { PoolClient } from "pg";
import { query } from "./db";

export type EventoAuditoria = {
  portal: string;
  actorTipo: "usuario" | "operador" | "publico" | "sistema";
  actorId?: number | string | null;
  actorNombre?: string | null;
  accion: string;
  entidad?: string;
  entidadId?: string | number | null;
  datos?: Record<string, unknown>;
  ip?: string | null;
};

// Nunca recibe PIN, contraseñas ni imágenes (§16.3). Con cliente participa en su transacción.
export async function registrarAuditoria(e: EventoAuditoria, client?: PoolClient): Promise<void> {
  const sql = `INSERT INTO auditoria (portal, actor_tipo, actor_id, actor_nombre, accion, entidad, entidad_id, datos, ip)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NULLIF($9,'')::inet)`;
  const params = [e.portal, e.actorTipo, e.actorId ?? null, e.actorNombre ?? null, e.accion, e.entidad ?? null, e.entidadId == null ? null : String(e.entidadId), JSON.stringify(e.datos ?? {}), e.ip ?? ""];
  if (client) await client.query(sql, params);
  else await query(sql, params);
}
