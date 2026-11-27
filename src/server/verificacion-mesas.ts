import type { PoolClient } from "pg";
import { CARGOS, type Cargo } from "../domain/cargos";
import type { ZonaColor } from "../domain/juntas";
import { validarCedula } from "../domain/ingreso";
import { registrarAuditoria } from "./auditoria";
import type { Modo } from "./config";
import { withTx } from "./db";
import { consultarSeguimientoDocumental, type FichaDocumentosFinanzas } from "./documentos";
import { normalizarCedula } from "./incorporar";
import { juntaPublicaSql } from "./junta-sql";
import { bloquearJuntas, insertarAsignacion, insertarMovimiento, type Actor, type Resultado } from "./movimientos";

export type JuntaPanorama = {
  id: number; junta: string; zona: ZonaColor;
  cargosPendientes: number; capturaPendiente: number; porValidar: number; delMjrv: number; validados: number; ausentes: number;
};

export async function listarPanoramaJuntas(): Promise<JuntaPanorama[]> {
  return withTx(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows: juntas } = await client.query<Pick<JuntaPanorama, "id" | "junta" | "zona">>(
      `SELECT id, ${juntaPublicaSql("juntas_madrid")} AS junta, zona_color AS zona
         FROM juntas_madrid ORDER BY orden_cercania, serie, numero`,
    );
    const { rows: actuaciones } = await client.query<{ junta_id: number; mjrv_id: number }>(
      "SELECT junta_id, mjrv_id FROM v_actuacion_mesa",
    );
    const { rows: ausencias } = await client.query<{ id: number; junta_id: number }>("SELECT id, junta_id FROM v_titular_mesa WHERE ausente");
    const documentos = await consultarSeguimientoDocumental(client);
    return juntas.map((junta) => {
      const confirmados = new Set(actuaciones.filter((a) => a.junta_id === junta.id).map((a) => a.mjrv_id));
      const cargosPendientes = CARGOS.length - confirmados.size;
      const ausentes = new Set(ausencias.filter((a) => a.junta_id === junta.id).map((a) => a.id));
      const fichas = documentos.filter((f) => f.juntaActualId === junta.id
        && (confirmados.has(f.id) || (cargosPendientes > 0 && !ausentes.has(f.id))));
      return {
        ...junta,
        cargosPendientes,
        ausentes: ausentes.size,
        capturaPendiente: fichas.filter((f) => !f.completos).length,
        porValidar: fichas.filter((f) => f.estado === "por_validar").length,
        delMjrv: fichas.filter((f) => f.estado !== "validado" && (f.origen === "mjrv" || f.origen === "mixto")).length,
        validados: fichas.filter((f) => f.estado === "validado").length,
      };
    });
  });
}

type PersonaMesa = { id: number; activo: boolean; cedula: string; nombre: string; juntaId: number; junta: string; actuacionId: number | null; actuacionCargo: Cargo | null };
const PERSONA = `SELECT m.id, m.activo, m.cedula, m.apellidos || ', ' || m.nombres AS nombre,
    coalesce(a.junta_actual_id, m.junta_origen_id) AS "juntaId", ${juntaPublicaSql("j")} AS junta,
    v.id AS "actuacionId", v.cargo AS "actuacionCargo"
  FROM mjrv m LEFT JOIN v_mjrv_asignacion a ON a.mjrv_id = m.id
  JOIN juntas_madrid j ON j.id = coalesce(a.junta_actual_id, m.junta_origen_id)
  LEFT JOIN v_actuacion_mesa v ON v.mjrv_id = m.id
  WHERE m.cedula = $1 AND (cne.en_prueba() OR NOT m.es_prueba)`;

export async function consultarJuntaVerificacion(juntaId: number, cedula?: string) {
  return withTx(async (client) => {
    const { rows: [{ modo }] } = await client.query<{ modo: Modo }>("SELECT modo FROM configuracion WHERE id = 1 FOR SHARE");
    const junta = await client.query("SELECT 1 FROM juntas_madrid WHERE id = $1", [juntaId]);
    if (!junta.rowCount) return null;
    const { rows: puestos } = await client.query<{ id: number; mjrvId: number; cargo: Cargo; nombre: string }>(
      `SELECT v.id, v.mjrv_id AS "mjrvId", v.cargo, m.apellidos || ', ' || m.nombres AS nombre
         FROM v_actuacion_mesa v JOIN mjrv m ON m.id = v.mjrv_id WHERE v.junta_id = $1`, [juntaId]);
    const { rows: titulares } = await client.query<{ id: number; cargo: Cargo; nombre: string; ausente: boolean }>(
      "SELECT id, cargo, nombre, ausente FROM v_titular_mesa WHERE junta_id = $1", [juntaId]);
    const persona = cedula ? (await client.query<PersonaMesa>(PERSONA, [normalizarCedula(cedula)])).rows[0] : null;
    const documentacion = (await consultarSeguimientoDocumental(client, juntaId))
      .map(({ id, cedula, nombre, estado, origen }) => ({ id, cedula, nombre, estado, origen }));
    return { modo, puestos, titulares, documentacion, actuantes: puestos.map((p) => p.mjrvId), persona: persona ?? null };
  });
}

export type DocumentoEnMesa = Pick<FichaDocumentosFinanzas, "id" | "cedula" | "nombre" | "estado" | "origen">;

type DatosActuacion = {
  cedula: string; nombres?: string; apellidos?: string; juntaId: number; cargo: string;
  modo: Modo; verificacionAnterior: number | null; personaAnterior: { id: number; juntaId: number; actuacionId: number | null } | null;
};
const fuera = (mensaje: string) => ({ ok: false as const, mensaje });
const cambio = () => ({ ok: false as const, cambio: true, mensaje: "La junta cambió. Vuelva a consultar antes de confirmar." });

export async function cambiarAusenciaMesa(actor: Actor, d: {
  juntaId: number; cargo: string; titularId: number; ausente: boolean; modo: Modo;
}): Promise<Resultado> {
  if (!CARGOS.includes(d.cargo as Cargo)) return fuera("Elija un cargo.");
  return withTx(async (client) => {
    const { rows: [{ modo }] } = await client.query<{ modo: Modo }>("SELECT modo FROM configuracion WHERE id = 1 FOR SHARE");
    if (modo !== d.modo) return fuera("El modo cambió. Vuelva a abrir el puesto.");
    await bloquearJuntas(client, [d.juntaId]);
    await client.query("SELECT id FROM mjrv WHERE id = $1 FOR UPDATE", [d.titularId]);
    const { rows: [titular] } = await client.query<{ id: number; ausente: boolean }>(
      "SELECT id, ausente FROM v_titular_mesa WHERE junta_id = $1 AND cargo = $2", [d.juntaId, d.cargo]);
    if (titular?.id !== d.titularId) return cambio();
    if (d.ausente && (await client.query("SELECT 1 FROM v_actuacion_mesa WHERE mjrv_id = $1", [titular.id])).rowCount) {
      return fuera("La persona ya tiene una actuación confirmada. Revise quién ejerció el cargo.");
    }
    const mensaje = d.ausente ? "Ausencia registrada." : "Ausencia retirada.";
    if (titular.ausente === d.ausente) return { ok: true, mensaje };
    await client.query(
      `INSERT INTO ausencias_mesa (junta_id, cargo, mjrv_id, activa) VALUES ($1, $2, $3, $4)
       ON CONFLICT (junta_id, cargo, mjrv_id, es_prueba) DO UPDATE SET activa = excluded.activa`,
      [d.juntaId, d.cargo, titular.id, d.ausente],
    );
    await registrarAuditoria({
      portal: "mando", actorTipo: actor.tipo === "operador" ? "operador" : "usuario",
      actorId: actor.id, actorNombre: actor.nombre, accion: d.ausente ? "ausencia_mesa_registrada" : "ausencia_mesa_retirada",
      entidad: "mjrv", entidadId: titular.id, datos: { modo, junta: d.juntaId, cargo: d.cargo },
    }, client);
    return { ok: true, mensaje };
  });
}

async function registrarIncorporacion(client: PoolClient, actor: Actor, d: DatosActuacion, cedula: string) {
  const { rows: [persona] } = await client.query<{ id: number }>(
    `INSERT INTO mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, fuente_archivo, incorporado_en, incorporado_por, es_prueba)
     VALUES ($1,$2,$3,'VOTANTE INCORPORADO','otro',$4,'verificación en mesa',now(),$5,cne.en_prueba())
     ON CONFLICT (cedula) DO NOTHING RETURNING id`,
    [cedula, d.apellidos?.trim(), d.nombres?.trim(), d.juntaId, actor.nombre],
  );
  return persona?.id;
}

export async function verificarActuacion(actor: Actor, d: DatosActuacion): Promise<Resultado> {
  const cedula = normalizarCedula(d.cedula);
  const cargo = d.cargo as Cargo;
  const identidad = validarCedula(cedula);
  if (!identidad.ok) return fuera(identidad.mensaje);
  if (!CARGOS.includes(cargo) || !Number.isSafeInteger(d.juntaId) || d.juntaId < 1) return fuera("Elija una junta y un cargo.");
  return withTx(async (client) => {
    const { rows: [{ modo }] } = await client.query<{ modo: Modo }>("SELECT modo FROM configuracion WHERE id = 1 FOR SHARE");
    if (modo !== d.modo) return fuera("El modo cambió. Vuelva a abrir el puesto.");
    if (!(await client.query("SELECT 1 FROM juntas_madrid WHERE id = $1", [d.juntaId])).rowCount) return fuera("La junta no existe.");
    const { rows: [previa] } = await client.query<PersonaMesa>(PERSONA, [cedula]);
    if (previa?.id !== d.personaAnterior?.id || previa?.juntaId !== d.personaAnterior?.juntaId || previa?.actuacionId !== d.personaAnterior?.actuacionId) return cambio();
    if (previa && !previa.activo) return fuera("La ficha está de baja. Consulte al responsable.");
    await bloquearJuntas(client, [previa?.juntaId ?? d.juntaId, d.juntaId]);
    const { rows: [ocupante] } = await client.query<{ id: number; mjrv_id: number; confirmada: boolean }>(
      `SELECT id, mjrv_id, verificada_en IS NOT NULL AS confirmada FROM asignaciones_cargo
        WHERE junta_id = $1 AND cargo = $2 AND activa AND es_prueba = cne.en_prueba()`, [d.juntaId, cargo]);
    const ids = [...new Set([previa?.id, ocupante?.mjrv_id].filter((id): id is number => id !== undefined))];
    await client.query("SELECT id FROM mjrv WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE", [ids]);
    const { rows: [vigente] } = await client.query<PersonaMesa>(PERSONA, [cedula]);
    if (vigente?.id !== previa?.id || vigente?.juntaId !== previa?.juntaId || vigente?.activo !== previa?.activo || vigente?.actuacionId !== previa?.actuacionId) return cambio();
    if (ocupante?.confirmada && ocupante.mjrv_id === vigente?.id) return { ok: true, mensaje: "La actuación ya está confirmada." };
    if ((ocupante?.confirmada ? ocupante.id : null) !== d.verificacionAnterior) return cambio();
    if ((await client.query(
      `SELECT 1 FROM pagos_confirmados WHERE mjrv_id = ANY($1::bigint[]) AND es_prueba = cne.en_prueba()
       UNION ALL SELECT 1 FROM firmas_recibo WHERE mjrv_id = ANY($1::bigint[]) AND es_prueba = cne.en_prueba()`, [ids],
    )).rowCount) return fuera("Ya hay un recibo firmado o un pago para una de las personas. Consulte a Finanzas.");

    let mjrvId = vigente?.id;
    if (!mjrvId) {
      if (!d.nombres?.trim() || !d.apellidos?.trim() || d.nombres.trim().length > 120 || d.apellidos.trim().length > 120) {
        return fuera("Escriba nombres y apellidos para incorporar a la persona.");
      }
      mjrvId = await registrarIncorporacion(client, actor, d, cedula);
      if (!mjrvId) return cambio();
    }
    const traslado = !!vigente && vigente.juntaId !== d.juntaId;
    if (traslado) await insertarMovimiento(client, actor, mjrvId, vigente.juntaId, d.juntaId, "aceptada", "Verificación en mesa", true);
    await client.query(`UPDATE excepciones_disponibilidad SET activa = false, anulada_en = now()
      WHERE mjrv_id = $1 AND activa AND es_prueba = cne.en_prueba()`, [mjrvId]);
    await insertarAsignacion(client, actor, {
      mjrvId, juntaId: d.juntaId, cargo, origen: traslado ? "traslado" : vigente ? "manual" : "incorporado", verificada: true,
    });
    await client.query("UPDATE ausencias_mesa SET activa = false WHERE mjrv_id = $1 AND activa AND es_prueba = cne.en_prueba()", [mjrvId]);
    await registrarAuditoria({
      portal: "mando", actorTipo: actor.tipo === "operador" ? "operador" : "usuario", actorId: actor.id, actorNombre: actor.nombre, accion: "actuacion_mesa_verificada",
      entidad: "mjrv", entidadId: mjrvId,
      datos: { modo, junta: d.juntaId, cargo, incorporada: !vigente, desde: traslado ? vigente.juntaId : null, reemplazo: ocupante?.mjrv_id ?? null },
    }, client);
    return { ok: true, mensaje: "Actuación confirmada." };
  });
}
