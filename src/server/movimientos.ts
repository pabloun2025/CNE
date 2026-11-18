import type { PoolClient } from "pg";
import { proponer, type DecisionProp, type JuntaProp, type PersonaProp, type Propuesta } from "../domain/propuestas";
import { MINIMO_JUNTA } from "../domain/mando";
import { leerJunta } from "../domain/juntas";
import { registrarAuditoria } from "./auditoria";
import { query, withTx } from "./db";

export type Actor = { tipo: "operador" | "madrid_admin"; id: number; nombre: string };
export type Resultado = { ok: true; mensaje?: string } | { ok: false; cambio?: boolean; confirmar?: boolean; mensaje: string };
export const MENSAJE_CAMBIO = "La situación cambió. Se calculó una nueva propuesta.";

export async function propuestaActual(): Promise<Propuesta | null> {
  const juntas = await query<JuntaProp>("SELECT id, serie, numero, zona_color AS zona, orden_cercania FROM juntas_madrid ORDER BY serie, numero");
  const personas = await query<PersonaProp>(
    `SELECT m.id, m.rol, m.apellidos, m.nombres, m.cedula, v.junta_origen_id, v.junta_actual_id, v.ingresado, v.con_excepcion
       FROM mjrv m JOIN v_mjrv_asignacion v ON v.mjrv_id = m.id`);
  const decisiones = await query<DecisionProp>("SELECT mjrv_id, junta_destino_id, decision, (rehabilitada_en IS NOT NULL) AS rehabilitada FROM decisiones_movimiento WHERE decision IN ('pasada','no_viable')");
  return proponer(juntas, personas, decisiones);
}

// Situación de la persona dentro de la transacción: junta vigente y si está presente. Bloquea sus filas.
async function situacion(client: PoolClient, mjrvId: number, origenId: number, destinoId: number) {
  // Bloqueos de aviso sobre las dos juntas (en orden, sin interbloqueos): serializan traslados que tocan la misma junta.
  for (const id of [...new Set([origenId, destinoId])].sort((a, b) => a - b)) await client.query("SELECT pg_advisory_xact_lock(7001, $1)", [id]);
  const m = (await client.query("SELECT 1 FROM mjrv WHERE id = $1 AND activo FOR UPDATE", [mjrvId])).rows[0];
  if (!m) return null;
  const v = (await client.query<{ junta_actual_id: number; ingresado: boolean; con_excepcion: boolean }>("SELECT junta_actual_id, ingresado, con_excepcion FROM v_mjrv_asignacion WHERE mjrv_id = $1", [mjrvId])).rows[0];
  const cuenta = async (j: number) => (await client.query<{ n: number }>("SELECT count(*)::int AS n FROM v_mjrv_asignacion WHERE junta_actual_id = $1 AND ingresado AND NOT con_excepcion", [j])).rows[0].n;
  return { v, origenPresentes: await cuenta(origenId), destinoPresentes: await cuenta(destinoId) };
}

const insertar = (client: PoolClient, a: Actor, mjrvId: number, origen: number, destino: number, decision: string, motivo: string | null, manual: boolean) =>
  client.query(
    "INSERT INTO decisiones_movimiento (mjrv_id, junta_origen_id, junta_destino_id, decision, motivo, manual, actor_tipo, actor_id, actor_nombre) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [mjrvId, origen, destino, decision, motivo, manual, a.tipo, a.id, a.nombre]);

// Aceptar una propuesta: el servidor vuelve a comprobar todo bajo bloqueo (el estado pudo cambiar desde que se mostró).
export async function aceptarPropuesta(a: Actor, p: { mjrvId: number; origenId: number; destinoId: number }): Promise<Resultado> {
  return withTx(async (client) => {
    const s = await situacion(client, p.mjrvId, p.origenId, p.destinoId);
    const valida = s && p.origenId !== p.destinoId && s.v.junta_actual_id === p.origenId && s.v.ingresado && !s.v.con_excepcion
      && s.origenPresentes - 1 >= MINIMO_JUNTA && s.destinoPresentes < MINIMO_JUNTA;
    if (!valida) return { ok: false as const, cambio: true, mensaje: MENSAJE_CAMBIO };
    await insertar(client, a, p.mjrvId, p.origenId, p.destinoId, "aceptada", null, false);
    await registrarAuditoria({ portal: "mando", actorTipo: a.tipo === "madrid_admin" ? "usuario" : "operador", actorId: a.id, actorNombre: a.nombre, accion: "movimiento_aceptado", entidad: "mjrv", entidadId: p.mjrvId, datos: { origen: p.origenId, destino: p.destinoId } }, client);
    return { ok: true as const };
  });
}

// «Siguiente propuesta» (pasada) y «No viable» solo registran la decisión; no mueven a nadie.
export async function descartarPropuesta(a: Actor, p: { mjrvId: number; origenId: number; destinoId: number }, decision: "pasada" | "no_viable", motivo?: string): Promise<Resultado> {
  const m = decision === "no_viable" ? (motivo ?? "").trim().slice(0, 200) : null;
  if (decision === "no_viable" && m!.length === 0) return { ok: false, mensaje: "Indique el motivo: no responde, se niega, no está u otro." };
  return withTx(async (client) => {
    const s = await situacion(client, p.mjrvId, p.origenId, p.destinoId);
    if (!s || s.v.junta_actual_id !== p.origenId) return { ok: false as const, cambio: true, mensaje: MENSAJE_CAMBIO };
    await insertar(client, a, p.mjrvId, p.origenId, p.destinoId, decision, m, false);
    return { ok: true as const };
  });
}

// Movimiento manual desde la ficha de junta. Si el origen quedaría con menos de 3, exige confirmación explícita.
export async function moverManual(a: Actor, d: { mjrvId: number; destino: string; confirmar: boolean }): Promise<Resultado> {
  const j = leerJunta(d.destino);
  if (!j) return { ok: false, mensaje: "La junta de destino no existe (H1–H41, M1–M54)." };
  const destinoId = (await query<{ id: number }>("SELECT id FROM juntas_madrid WHERE serie = $1 AND numero = $2", [j.serie, j.numero]))[0].id;
  const origenId = (await query<{ junta_actual_id: number }>("SELECT junta_actual_id FROM v_mjrv_asignacion WHERE mjrv_id = $1", [d.mjrvId]))[0]?.junta_actual_id;
  if (!origenId) return { ok: false, mensaje: "La persona no existe o está de baja." };
  if (origenId === destinoId) return { ok: false, mensaje: "La persona ya está en esa junta." };
  return withTx(async (client) => {
    const s = await situacion(client, d.mjrvId, origenId, destinoId);
    if (!s || s.v.junta_actual_id !== origenId) return { ok: false as const, cambio: true, mensaje: MENSAJE_CAMBIO };
    const quedaria = s.origenPresentes - (s.v.ingresado && !s.v.con_excepcion ? 1 : 0);
    if (quedaria < MINIMO_JUNTA && !d.confirmar) return { ok: false as const, confirmar: true, mensaje: `El origen quedará con ${quedaria}. Confirme para continuar.` };
    await insertar(client, a, d.mjrvId, origenId, destinoId, "aceptada", null, true);
    await registrarAuditoria({ portal: "mando", actorTipo: a.tipo === "madrid_admin" ? "usuario" : "operador", actorId: a.id, actorNombre: a.nombre, accion: "movimiento_manual", entidad: "mjrv", entidadId: d.mjrvId, datos: { origen: origenId, destino: destinoId } }, client);
    return { ok: true as const };
  });
}

export async function marcarNoDisponible(a: Actor, mjrvId: number, motivo: string): Promise<Resultado> {
  const m = motivo.trim();
  if (m.length < 2 || m.length > 200) return { ok: false, mensaje: "Escriba el motivo (2 a 200 caracteres)." };
  const r = await query("INSERT INTO excepciones_disponibilidad (mjrv_id, motivo, actor_tipo, actor_id, actor_nombre) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (mjrv_id, es_prueba) WHERE activa DO NOTHING RETURNING id", [mjrvId, m, a.tipo, a.id, a.nombre]);
  return r[0] ? { ok: true } : { ok: false, mensaje: "Ya estaba marcada como no disponible." };
}

export async function quitarExcepcion(mjrvId: number): Promise<Resultado> {
  await query("UPDATE excepciones_disponibilidad SET activa = false, anulada_en = now() WHERE mjrv_id = $1 AND activa", [mjrvId]);
  return { ok: true };
}

export async function rehabilitar(mjrvId: number): Promise<Resultado> {
  await query("UPDATE decisiones_movimiento SET rehabilitada_en = now() WHERE mjrv_id = $1 AND decision = 'no_viable' AND rehabilitada_en IS NULL", [mjrvId]);
  return { ok: true };
}
