import { query } from "./db";
import type { FilaInforme } from "../domain/informe";
import type { EstadoPago } from "./finanzas";

export type FilaFinanzas = FilaInforme & {
  id: number; apellidos: string; nombres: string; estado: EstadoPago;
  cedulaValidada: boolean; fotosCompletas: boolean;
};
export type ResumenFinanzas = {
  generado_en: string; modoPrueba: boolean;
  pagados: number; pendientes: number; documentacionIncompleta: number; sinCedulaValidada: number; pagosSinImporteEur: number; totalEur: string; filas: FilaFinanzas[];
};

// Una sola consulta mantiene coherentes las fichas, el modo, el total y la hora de corte.
// La fecha de validación pertenece a la ficha y se conserva al borrar las fotos.
export async function resumenFinanzas(): Promise<ResumenFinanzas> {
  const [{ filas, totalEur, generadoEn, modoPrueba }] = await query<{ filas: FilaFinanzas[]; totalEur: string; generadoEn: Date; modoPrueba: boolean }>(
    `SELECT statement_timestamp() AS "generadoEn", coalesce(en_prueba(), true) AS "modoPrueba",
            (SELECT coalesce(sum(importe_eur), 0)::text FROM pagos_confirmados) AS "totalEur",
            ARRAY(SELECT row_to_json(f) FROM (
     SELECT m.id, m.cedula, m.apellidos, m.nombres, m.apellidos || ', ' || m.nombres AS nombre,
            jv.serie || jv.numero AS junta, jv.zona_color AS zona, m.cargo_original AS cargo,
            CASE WHEN m.incorporado_en IS NOT NULL AND m.es_prueba = en_prueba() THEN m.incorporado_en::text ELSE l.creado_en::text END AS "ingresoEn",
            CASE WHEN m.incorporado_en IS NOT NULL AND m.es_prueba = en_prueba() THEN m.incorporado_por ELSE nullif(btrim(i.nombre || ' ' || i.apellido), '') END AS "operadorIngreso",
            m.cedula_validada_en::text AS "validacionEn",
            CASE WHEN p.id IS NOT NULL THEN 'pagada'
                 WHEN d.n < 2 THEN 'documentacion_incompleta'
                 WHEN EXISTS (SELECT 1 FROM actas_pago a WHERE a.mjrv_id = m.id) THEN 'acta_preparada'
                 ELSE 'lista' END AS estado,
            p.importe_eur::text AS eur, p.confirmado_en::text AS hora, coalesce(nullif(btrim(o.nombre || ' ' || o.apellido), ''), u.nombre) AS operador, coalesce(p.es_prueba, false) AS simulado,
            (m.cedula_validada_en IS NOT NULL) AS "cedulaValidada", (d.n = 2) AS "fotosCompletas"
       FROM mjrv m
       JOIN juntas_madrid jv ON jv.id = coalesce((SELECT x.junta_destino_id FROM decisiones_movimiento x WHERE x.mjrv_id = m.id AND x.decision = 'aceptada' ORDER BY x.creado_en DESC, x.id DESC LIMIT 1), m.junta_origen_id)
       CROSS JOIN LATERAL (SELECT count(DISTINCT lado)::int AS n FROM documentos_mjrv WHERE mjrv_id = m.id) d
       LEFT JOIN lecturas_puerta l ON l.mjrv_id = m.id AND l.resultado = 'valido'
       LEFT JOIN operadores_madrid i ON i.id = l.operador_id
       LEFT JOIN pagos_confirmados p ON p.mjrv_id = m.id
       LEFT JOIN operadores_madrid o ON o.id = p.operador_id
       LEFT JOIN usuarios u ON u.id = p.usuario_id
      WHERE m.activo OR p.id IS NOT NULL
      ORDER BY (p.id IS NULL) DESC, p.confirmado_en DESC, m.apellidos
    ) f) AS filas`);
  return {
    generado_en: generadoEn.toISOString(), modoPrueba,
    pagados: filas.filter((f) => f.estado === "pagada").length,
    pendientes: filas.filter((f) => f.estado !== "pagada").length,
    documentacionIncompleta: filas.filter((f) => f.estado === "documentacion_incompleta").length,
    sinCedulaValidada: filas.filter((f) => !f.cedulaValidada).length,
    pagosSinImporteEur: filas.filter((f) => f.estado === "pagada" && f.eur === null).length,
    totalEur, filas,
  };
}
