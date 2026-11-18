import { PARAMETROS_VACIOS, validarParametros, type ParametrosPago } from "../domain/pago";
import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { query } from "./db";

export async function leerParametros(): Promise<ParametrosPago> {
  const f = await query<ParametrosPago>("SELECT importe_eur::text, pagador_nombre, pagador_cargo, lugar FROM parametros_pago WHERE id = 1");
  return f[0] ?? PARAMETROS_VACIOS;
}

export async function guardarParametros(sesion: Sesion, entrada: Record<keyof ParametrosPago, string>): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const v = validarParametros(entrada);
  if (!v.ok) return v;
  const p = v.valores;
  await query(
    `UPDATE parametros_pago SET importe_eur=$1, pagador_nombre=$2, pagador_cargo=$3, lugar=$4,
            actualizado_en = now(), actualizado_por = $5 WHERE id = 1`,
    [p.importe_eur, p.pagador_nombre, p.pagador_cargo, p.lugar, sesion.usuarioId]);
  await registrarAuditoria({ portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "parametros_pago_guardados", entidad: "parametros_pago", entidadId: 1, datos: p });
  return { ok: true };
}
