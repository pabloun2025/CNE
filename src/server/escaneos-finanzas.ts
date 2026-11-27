import { registrarAuditoria } from "./auditoria";
import type { Modo } from "./config";
import type { ActorPago } from "./finanzas";
import { withTx } from "./db";
import { juntaPublicaSql } from "./junta-sql";
import { normalizarCedula } from "./revocar-credencial";

export type EtapaFinanzas = "revision" | "impresion" | "caja";
type DestinoEscaneo = { etapa: EtapaFinanzas | "pagada"; nombre: string };

// Ambos ingresos registran una sola ficha por modo y devuelven el destino vigente.
export async function ingresarFinanzas(enlaceId: number, cedulaBruta: string): Promise<DestinoEscaneo | null> {
  const cedula = normalizarCedula(cedulaBruta);
  if (!/^[0-9A-Z-]{5,20}$/.test(cedula)) return null;

  return withTx(async (client) => {
    await client.query("SELECT modo FROM configuracion WHERE id = 1 FOR SHARE");
    const [ficha] = (await client.query<{ id: number }>(
      "SELECT id FROM mjrv WHERE cedula = $1 AND activo AND (cne.en_prueba() OR NOT es_prueba) FOR UPDATE", [cedula],
    )).rows;
    if (!ficha) return null;
    await client.query("INSERT INTO escaneos_finanzas (mjrv_id, enlace_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [ficha.id, enlaceId]);
    const { rows: [destino] } = await client.query<DestinoEscaneo>(
      "SELECT etapa, nombre FROM v_circuito_finanzas WHERE mjrv_id = $1", [ficha.id]);
    return destino ?? null;
  });
}

export async function registrarEscaneoFinanzas(enlaceId: number, cedulaBruta: string): Promise<boolean> {
  return (await ingresarFinanzas(enlaceId, cedulaBruta)) !== null;
}

export type SolicitudImpresion = { mjrvId: number; actaId: number; modo: Modo; version: string };

export async function marcarReciboImpreso(actor: ActorPago, solicitud: SolicitudImpresion):
  Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const { mjrvId, actaId, modo, version } = solicitud;
  return withTx(async (client) => {
    const { rows: [config] } = await client.query<{ modo: Modo }>("SELECT modo FROM configuracion WHERE id = 1 FOR SHARE");
    if (config.modo !== modo) return { ok: false, mensaje: "El modo cambió. Vuelva a abrir la ficha." };
    const { rowCount: existe } = await client.query("SELECT 1 FROM mjrv WHERE id = $1 AND activo AND (cne.en_prueba() OR NOT es_prueba) FOR UPDATE", [mjrvId]);
    if (!existe) return { ok: false, mensaje: "La ficha no existe o está de baja." };
    const { rows: [vigente] } = await client.query<{
      etapa: DestinoEscaneo["etapa"]; version: string | null; version_papel_generado: string | null; acta_pendiente: boolean;
    }>("SELECT etapa, version, version_papel_generado, acta_pendiente FROM v_circuito_finanzas WHERE mjrv_id = $1 AND acta_id = $2", [mjrvId, actaId]);
    if (!vigente || vigente.etapa === "pagada") return { ok: false, mensaje: "El recibo no está pendiente de cobro." };
    if (vigente.acta_pendiente || !vigente.version || vigente.version_papel_generado !== vigente.version || version !== vigente.version) {
      return { ok: false, mensaje: "Vuelva a generar e imprimir el recibo con los datos vigentes." };
    }
    if (vigente.etapa === "caja") return { ok: true };
    await client.query(
      "UPDATE actas_pago SET version_papel_impreso = $2, papel_impreso_en = clock_timestamp() WHERE id = $1",
      [actaId, vigente.version]);
    await registrarAuditoria({
      portal: "finanzas", actorTipo: actor.usuarioId ? "usuario" : "operador", actorId: actor.usuarioId ?? actor.operadorId,
      actorNombre: actor.operadorNombre, accion: "recibo_impreso_para_caja", entidad: "actas_pago", entidadId: actaId,
      datos: { mjrvId, modo },
    }, client);
    return { ok: true };
  });
}

type EscaneadoFinanzas = {
  mjrvId: number;
  cedula: string;
  nombre: string;
  junta: string;
  escaneadoEn: Date;
  actaId: number | null;
  emitido: boolean;
  pagado: boolean;
  documentado: boolean;
};

export async function listarEscaneadosFinanzas(filtro: boolean | EtapaFinanzas) {
  return withTx(async (client) => {
    // Conserva el modo mientras se consultan las tablas que lo usan en sus políticas.
    const [{ modo }] = (await client.query<{ modo: Modo }>("SELECT modo FROM configuracion WHERE id = 1 FOR SHARE")).rows;
    if (typeof filtro === "string") {
      const { rows } = await client.query<EscaneadoFinanzas>(
        `SELECT c.mjrv_id AS "mjrvId", c.cedula, c.nombre, ${juntaPublicaSql("c")} AS junta, c.escaneado_en AS "escaneadoEn",
                c.acta_id AS "actaId", c.acta_id IS NOT NULL AS emitido, false AS pagado, c.documentado
           FROM v_circuito_finanzas c WHERE c.etapa = $1 AND c.en_cola
          ORDER BY c.escaneado_en DESC, c.mjrv_id`, [filtro]);
      return { modo, escaneados: rows.map((r) => ({ ...r, escaneadoEn: r.escaneadoEn.toISOString() })) };
    }
    const caja = filtro;
    const { rows } = await client.query<EscaneadoFinanzas>(
      `WITH candidatas AS (
        SELECT m.id AS "mjrvId", m.cedula, m.apellidos || ', ' || m.nombres AS nombre,
               ${juntaPublicaSql("j")} AS junta,
               coalesce(e.creado_en, a.creado_en) AS "escaneadoEn", a.id AS "actaId",
               a.id IS NOT NULL AS emitido, false AS pagado,
               EXISTS (SELECT 1 FROM v_cedulas_validadas v WHERE v.mjrv_id = m.id)
                 AND EXISTS (SELECT 1 FROM v_documentos_completos d WHERE d.mjrv_id = m.id)
                 AND (NOT $1 OR (
                   NOT EXISTS (SELECT 1 FROM v_identidad_recibo_pendiente i WHERE i.acta_id = a.id)
                   AND NOT EXISTS (SELECT 1 FROM v_actuacion_retirada r WHERE r.mjrv_id = m.id))) AS documentado
          FROM mjrv m
          LEFT JOIN escaneos_finanzas e ON e.mjrv_id = m.id
          LEFT JOIN actas_pago a ON a.mjrv_id = m.id AND a.recibo_principal AND a.importe_eur > 0
          JOIN juntas_madrid j ON j.id = coalesce(
            (SELECT d.junta_destino_id FROM decisiones_movimiento d WHERE d.mjrv_id = m.id AND d.decision = 'aceptada' ORDER BY d.creado_en DESC, d.id DESC LIMIT 1),
            m.junta_origen_id)
         WHERE m.activo AND (cne.en_prueba() OR NOT m.es_prueba)
           AND (CASE WHEN $1 THEN a.id IS NOT NULL ELSE e.mjrv_id IS NOT NULL END)
           AND NOT EXISTS (SELECT 1 FROM pagos_confirmados p WHERE p.mjrv_id = m.id)
      )
      SELECT * FROM candidatas WHERE NOT $1 OR documentado ORDER BY "escaneadoEn" DESC, "mjrvId"`, [caja],
    );
    return { modo, escaneados: rows.map((r) => ({ ...r, escaneadoEn: r.escaneadoEn.toISOString() })) };
  });
}
