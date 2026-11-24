import type { Modo } from "./config";
import { withTx } from "./db";
import { juntaPublicaSql } from "./junta-sql";
import { normalizarCedula } from "./revocar-credencial";

// Se acepta una sola cédula activa y se conserva la hora del primer escaneo de ese modo.
export async function registrarEscaneoFinanzas(enlaceId: number, cedulaBruta: string): Promise<boolean> {
  const cedula = normalizarCedula(cedulaBruta);
  if (!/^[0-9A-Z-]{5,20}$/.test(cedula)) return false;

  return withTx(async (client) => {
    await client.query("SELECT modo FROM configuracion WHERE id = 1 FOR SHARE");
    const [ficha] = (await client.query<{ id: number }>(
      "SELECT id FROM mjrv WHERE cedula = $1 AND activo AND (cne.en_prueba() OR NOT es_prueba) FOR SHARE", [cedula],
    )).rows;
    if (!ficha) return false;
    await client.query("INSERT INTO escaneos_finanzas (mjrv_id, enlace_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [ficha.id, enlaceId]);
    return true;
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

export async function listarEscaneadosFinanzas(caja: boolean) {
  return withTx(async (client) => {
    // Conserva el modo mientras se consultan las tablas que lo usan en sus políticas.
    const [{ modo }] = (await client.query<{ modo: Modo }>("SELECT modo FROM configuracion WHERE id = 1 FOR SHARE")).rows;
    const { rows } = await client.query<EscaneadoFinanzas>(
      `WITH candidatas AS (
        SELECT m.id AS "mjrvId", m.cedula, m.apellidos || ', ' || m.nombres AS nombre,
               ${juntaPublicaSql("j")} AS junta,
               coalesce(e.creado_en, a.creado_en) AS "escaneadoEn", a.id AS "actaId",
               a.id IS NOT NULL AS emitido, false AS pagado,
               EXISTS (SELECT 1 FROM v_cedulas_validadas v WHERE v.mjrv_id = m.id)
                 AND EXISTS (SELECT 1 FROM v_documentos_completos d WHERE d.mjrv_id = m.id)
                 AND (NOT $1 OR NOT EXISTS (SELECT 1 FROM v_identidad_recibo_pendiente i WHERE i.acta_id = a.id)) AS documentado
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
