import type { PoolClient } from "pg";
import { armarPropuesta, juntasConVacantes, opcionesPropuesta, propuestaElegida, type DecisionProp, type JuntaProp, type PersonaProp, type Propuesta } from "../domain/propuestas";
import { pedirPropuestaIa } from "./propuesta-ia";
import { leerAsignaciones } from "./mando";
import { CARGOS, cubrirCargos, type AsignacionCargo, type Cargo, type CoberturaJunta, type PersonaCargo } from "../domain/cargos";
import { leerJunta } from "../domain/juntas";
import { registrarAuditoria } from "./auditoria";
import { query, withTx } from "./db";

export type Actor = { tipo: "operador" | "madrid_admin"; id: number; nombre: string };
export type Resultado = { ok: true; mensaje?: string } | { ok: false; cambio?: boolean; confirmar?: boolean; mensaje: string };
export const MENSAJE_CAMBIO = "La situación cambió. Se calculó una nueva propuesta.";

export async function propuestaActual(): Promise<Propuesta | null> {
  return (await datosPropuesta()).propuesta;
}

// La propuesta y cuántas juntas con gente presente siguen con algún cargo vacante (para «Incorpore un votante»).
export async function datosPropuesta(): Promise<{ propuesta: Propuesta | null; juntasConVacantes: number }> {
  const juntas = await query<JuntaProp>("SELECT id, serie, numero, zona_color AS zona, orden_cercania FROM juntas_madrid ORDER BY serie, numero");
  const personas = await query<PersonaProp>(
    `SELECT m.id, m.rol, m.apellidos, m.nombres, m.cedula, m.fila_origen, v.junta_origen_id, v.junta_actual_id, v.ingresado, v.con_excepcion
       FROM mjrv m JOIN v_mjrv_asignacion v ON v.mjrv_id = m.id`);
  const decisiones = await query<DecisionProp>("SELECT mjrv_id, junta_destino_id, decision, (rehabilitada_en IS NOT NULL) AS rehabilitada FROM decisiones_movimiento WHERE decision IN ('pasada','no_viable')");
  const asignaciones = await leerAsignaciones();
  const opciones = opcionesPropuesta(juntas, personas, decisiones, asignaciones);
  // Una sola propuesta. Si el contenedor no contesta, queda la primera opción legal: el funcionario igual la acepta o la rechaza.
  const ia = await pedirPropuestaIa(opciones.map((o) => ({
    mjrvId: o.p.id, destinoId: o.d.id, persona: `${o.p.apellidos}, ${o.p.nombres}`,
    origen: `${o.o.serie}${o.o.numero}`, destino: `${o.d.serie}${o.d.numero}`, zona: o.d.zona, distancia: o.distancia, mismaZona: o.mismaZona,
  })));
  const elegida = ia ? propuestaElegida(opciones, ia.mjrvId, ia.destinoId) : null;
  return { propuesta: elegida ?? (opciones[0] ? armarPropuesta(opciones[0]) : null), juntasConVacantes: juntasConVacantes(juntas, personas, asignaciones) };
}

// Bloqueos de aviso sobre las juntas implicadas (en orden, sin interbloqueos): serializan cambios que tocan la misma junta.
async function bloquear(client: PoolClient, juntas: number[]) {
  for (const id of [...new Set(juntas)].sort((a, b) => a - b)) await client.query("SELECT pg_advisory_xact_lock(7001, $1)", [id]);
}

// Situación de la persona dentro de la transacción: junta vigente y si está presente. Bloquea sus filas.
async function situacion(client: PoolClient, mjrvId: number, origenId: number, destinoId: number) {
  await bloquear(client, [origenId, destinoId]);
  const m = (await client.query("SELECT 1 FROM mjrv WHERE id = $1 AND activo FOR UPDATE", [mjrvId])).rows[0];
  if (!m) return null;
  const v = (await client.query<{ junta_actual_id: number; ingresado: boolean; con_excepcion: boolean }>("SELECT junta_actual_id, ingresado, con_excepcion FROM v_mjrv_asignacion WHERE mjrv_id = $1", [mjrvId])).rows[0];
  return { v };
}

const insertar = (client: PoolClient, a: Actor, mjrvId: number, origen: number, destino: number, decision: string, motivo: string | null, manual: boolean) =>
  client.query(
    "INSERT INTO decisiones_movimiento (mjrv_id, junta_origen_id, junta_destino_id, decision, motivo, manual, actor_tipo, actor_id, actor_nombre) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [mjrvId, origen, destino, decision, motivo, manual, a.tipo, a.id, a.nombre]);

// Aceptar una propuesta: el servidor vuelve a comprobar todo bajo bloqueo (el estado pudo cambiar desde que se mostró).
// La persona sigue siendo un suplente transferible de su junta y el cargo sigue vacante en el destino; se guardan la decisión y el cargo.
export async function aceptarPropuesta(a: Actor, p: { mjrvId: number; origenId: number; destinoId: number; cargo: string }): Promise<Resultado> {
  return withTx(async (client) => {
    const s = await situacion(client, p.mjrvId, p.origenId, p.destinoId);
    const cargo = p.cargo as Cargo;
    const valida = !!s && (CARGOS as string[]).includes(p.cargo) && p.origenId !== p.destinoId && s.v.junta_actual_id === p.origenId && s.v.ingresado && !s.v.con_excepcion
      && (await coberturaEnTx(client, p.origenId)).transferibles.includes(p.mjrvId)
      && (await coberturaEnTx(client, p.destinoId)).vacantes.includes(cargo);
    if (!valida) return { ok: false as const, cambio: true, mensaje: MENSAJE_CAMBIO };
    await insertar(client, a, p.mjrvId, p.origenId, p.destinoId, "aceptada", null, false);
    await insertarAsignacion(client, a, { mjrvId: p.mjrvId, juntaId: p.destinoId, cargo, origen: "traslado" });
    await registrarAuditoria({ portal: "mando", actorTipo: a.tipo === "madrid_admin" ? "usuario" : "operador", actorId: a.id, actorNombre: a.nombre, accion: "movimiento_aceptado", entidad: "mjrv", entidadId: p.mjrvId, datos: { origen: p.origenId, destino: p.destinoId, cargo } }, client);
    return { ok: true as const };
  });
}

// «Siguiente propuesta» (pasada) y «No viable» solo registran la decisión; no mueven a nadie.
export async function descartarPropuesta(a: Actor, p: { mjrvId: number; origenId: number; destinoId: number }, decision: "pasada" | "no_viable", motivo?: string): Promise<Resultado> {
  const m = decision === "no_viable" ? (motivo ?? "").trim().slice(0, 200) : null;
  if (decision === "no_viable" && m!.length === 0) return { ok: false, mensaje: "Indique el motivo: no contesta, no quiere o ya no está." };
  return withTx(async (client) => {
    const s = await situacion(client, p.mjrvId, p.origenId, p.destinoId);
    if (!s || s.v.junta_actual_id !== p.origenId) return { ok: false as const, cambio: true, mensaje: MENSAJE_CAMBIO };
    await insertar(client, a, p.mjrvId, p.origenId, p.destinoId, decision, m, false);
    return { ok: true as const };
  });
}

// Movimiento manual desde la ficha de junta, con cargo opcional (una vacante del destino o «sin cargo»).
// Si la persona cubre un cargo en el origen y la junta quedaría con menos cargos cubiertos, exige confirmación explícita.
export async function moverManual(a: Actor, d: { mjrvId: number; destino: string; confirmar: boolean; cargo?: string }): Promise<Resultado> {
  const j = leerJunta(d.destino);
  if (!j) return { ok: false, mensaje: "La junta de destino no existe (H1–H41, M1–M54)." };
  const destinoId = (await query<{ id: number }>("SELECT id FROM juntas_madrid WHERE serie = $1 AND numero = $2", [j.serie, j.numero]))[0].id;
  const origenId = (await query<{ junta_actual_id: number }>("SELECT junta_actual_id FROM v_mjrv_asignacion WHERE mjrv_id = $1", [d.mjrvId]))[0]?.junta_actual_id;
  if (!origenId) return { ok: false, mensaje: "La persona no existe o está de baja." };
  if (origenId === destinoId) return { ok: false, mensaje: "La persona ya está en esa junta." };
  const cargo = (d.cargo ?? "").trim();
  if (cargo && !(CARGOS as string[]).includes(cargo)) return { ok: false, mensaje: "El cargo no es válido." };
  return withTx(async (client) => {
    const s = await situacion(client, d.mjrvId, origenId, destinoId);
    if (!s || s.v.junta_actual_id !== origenId) return { ok: false as const, cambio: true, mensaje: MENSAJE_CAMBIO };
    // ¿Qué cargos quedarían sin cubrir en el origen al irse la persona?
    if (s.v.ingresado && !s.v.con_excepcion) {
      const antes = await coberturaEnTx(client, origenId);
      if (antes.presentes.includes(d.mjrvId)) {
        const nuevas = await vacantesSinPersona(client, origenId, d.mjrvId);
        const abiertas = nuevas.filter((c) => !antes.vacantes.includes(c));
        if (abiertas.length > 0 && !d.confirmar) {
          const etiquetaOrigen = (await client.query<{ e: string }>("SELECT serie || numero AS e FROM juntas_madrid WHERE id = $1", [origenId])).rows[0].e;
          return { ok: false as const, confirmar: true, mensaje: `${etiquetaOrigen} quedará sin ${abiertas.join(" ni ")}. ¿Continuar?` };
        }
      }
    }
    if (cargo && !(await coberturaEnTx(client, destinoId)).vacantes.includes(cargo as Cargo)) return { ok: false as const, cambio: true, mensaje: `El cargo de ${cargo} ya no está vacante en el destino.` };
    await insertar(client, a, d.mjrvId, origenId, destinoId, "aceptada", null, true);
    // La asignación anterior de la persona deja de valer; con cargo se crea la nueva.
    await client.query("UPDATE asignaciones_cargo SET activa = false, anulada_en = now() WHERE activa AND mjrv_id = $1", [d.mjrvId]);
    if (cargo) await insertarAsignacion(client, a, { mjrvId: d.mjrvId, juntaId: destinoId, cargo: cargo as Cargo, origen: "traslado" });
    await registrarAuditoria({ portal: "mando", actorTipo: a.tipo === "madrid_admin" ? "usuario" : "operador", actorId: a.id, actorNombre: a.nombre, accion: "movimiento_manual", entidad: "mjrv", entidadId: d.mjrvId, datos: { origen: origenId, destino: destinoId, cargo: cargo || null } }, client);
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

// ───────────── Cargos por junta (decisión 9, 09 §3.4) ─────────────
// Cobertura de una junta dentro de la transacción, bajo el bloqueo de aviso de esa junta. `sin` simula que una persona se fue.
async function datosCobertura(client: PoolClient, juntaId: number) {
  const personas = (await client.query<PersonaCargo>(
    `SELECT m.id, m.rol, m.fila_origen, m.apellidos, v.junta_origen_id, v.junta_actual_id, v.ingresado, v.con_excepcion
       FROM mjrv m JOIN v_mjrv_asignacion v ON v.mjrv_id = m.id WHERE v.junta_actual_id = $1 OR v.junta_origen_id = $1`, [juntaId])).rows;
  const asignaciones = (await client.query<AsignacionCargo>("SELECT mjrv_id, junta_id, cargo, origen FROM asignaciones_cargo WHERE junta_id = $1 AND activa", [juntaId])).rows;
  return { personas, asignaciones };
}
export async function coberturaEnTx(client: PoolClient, juntaId: number): Promise<CoberturaJunta> {
  const { personas, asignaciones } = await datosCobertura(client, juntaId);
  return cubrirCargos([juntaId], personas, asignaciones).get(juntaId)!;
}
async function vacantesSinPersona(client: PoolClient, juntaId: number, mjrvId: number): Promise<Cargo[]> {
  const { personas, asignaciones } = await datosCobertura(client, juntaId);
  return cubrirCargos([juntaId], personas.filter((p) => p.id !== mjrvId), asignaciones).get(juntaId)!.vacantes;
}

export const insertarAsignacion = async (client: PoolClient, a: Actor, d: { mjrvId: number; juntaId: number; cargo: Cargo; origen: "traslado" | "incorporado" | "manual" }) => {
  // Toda asignación nueva de la persona o del puesto anula la anterior, en la misma transacción.
  await client.query("UPDATE asignaciones_cargo SET activa = false, anulada_en = now() WHERE activa AND (mjrv_id = $1 OR (junta_id = $2 AND cargo = $3))", [d.mjrvId, d.juntaId, d.cargo]);
  await client.query(
    "INSERT INTO asignaciones_cargo (mjrv_id, junta_id, cargo, origen, actor_tipo, actor_id, actor_nombre) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [d.mjrvId, d.juntaId, d.cargo, d.origen, a.tipo, a.id, a.nombre]);
};

const actorAuditoria = (a: Actor) => ({ actorTipo: (a.tipo === "madrid_admin" ? "usuario" : "operador") as "usuario" | "operador", actorId: a.id, actorNombre: a.nombre });

// «Asignar» a mano una persona presente en la junta a un cargo vacante.
export async function asignarCargo(a: Actor, d: { juntaId: number; mjrvId: number; cargo: string }): Promise<Resultado> {
  if (!(CARGOS as string[]).includes(d.cargo)) return { ok: false, mensaje: "El cargo no es válido." };
  const cargo = d.cargo as Cargo;
  return withTx(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(7001, $1)", [d.juntaId]);
    const c = await coberturaEnTx(client, d.juntaId);
    if (!c.presentes.includes(d.mjrvId) || !c.vacantes.includes(cargo)) return { ok: false as const, cambio: true, mensaje: "La situación cambió: el cargo ya no está vacante o la persona ya no está en la junta." };
    await insertarAsignacion(client, a, { mjrvId: d.mjrvId, juntaId: d.juntaId, cargo, origen: "manual" });
    await registrarAuditoria({ portal: "mando", ...actorAuditoria(a), accion: "cargo_asignado", entidad: "mjrv", entidadId: d.mjrvId, datos: { junta: d.juntaId, cargo } }, client);
    return { ok: true as const };
  });
}

// «Quitar» una asignación explícita (traslado, incorporación o a mano): el cargo vuelve a quedar vacante o lo cubre otro por regla.
export async function quitarCargo(a: Actor, d: { juntaId: number; mjrvId: number }): Promise<Resultado> {
  return withTx(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(7001, $1)", [d.juntaId]);
    const r = await client.query<{ cargo: string }>("UPDATE asignaciones_cargo SET activa = false, anulada_en = now() WHERE activa AND mjrv_id = $1 AND junta_id = $2 RETURNING cargo", [d.mjrvId, d.juntaId]);
    if (!r.rows[0]) return { ok: false as const, cambio: true, mensaje: "Esa persona ya no tenía un cargo asignado a mano en esta junta." };
    await registrarAuditoria({ portal: "mando", ...actorAuditoria(a), accion: "cargo_quitado", entidad: "mjrv", entidadId: d.mjrvId, datos: { junta: d.juntaId, cargo: r.rows[0].cargo } }, client);
    return { ok: true as const };
  });
}
