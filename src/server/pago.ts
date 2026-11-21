import type { PoolClient } from "pg";
import { PARAMETROS_VACIOS, validarParametros, type ParametrosPago } from "../domain/pago";
import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { query, withTx } from "./db";

export async function leerParametros(client?: PoolClient): Promise<ParametrosPago> {
  const sql = "SELECT importe_usd::text, importe_eur::text, pagador_nombre, pagador_cargo, lugar FROM parametros_pago WHERE id = 1";
  const f = client ? (await client.query<ParametrosPago>(sql)).rows : await query<ParametrosPago>(sql);
  return f[0] ?? PARAMETROS_VACIOS;
}

export async function guardarParametros(sesion: Sesion, { pagador_nombre, pagador_cargo }: { pagador_nombre: string; pagador_cargo: string }): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  if (sesion.tipo !== "superadmin") throw new Error("Solo Superadministración puede configurar los pagos.");
  const v = validarParametros({ pagador_nombre, pagador_cargo, importe_usd: "", importe_eur: "", lugar: "" });
  if (!v.ok) return v;
  const { pagador_nombre: nombre, pagador_cargo: cargo } = v.valores;
  await withTx(async (client) => {
    await client.query(
      "UPDATE parametros_pago SET pagador_nombre = $1, pagador_cargo = $2, actualizado_en = now(), actualizado_por = $3 WHERE id = 1",
      [nombre, cargo, sesion.usuarioId]);
    await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "parametros_pago_guardados", entidad: "parametros_pago", entidadId: 1, datos: { pagador_nombre: nombre, pagador_cargo: cargo } }, client);
  });
  return { ok: true };
}
