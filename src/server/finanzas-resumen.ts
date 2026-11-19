import { query } from "./db";
import { leerModo } from "./config";
import type { EstadoPago } from "./finanzas";

export type FilaFinanzas = {
  id: number; cedula: string; apellidos: string; nombres: string; nombre: string; junta: string;
  estado: EstadoPago; eur: string | null; hora: string | null; operador: string | null; simulado: boolean;
  cedulaValidada: boolean; fotosCompletas: boolean;
};
export type ResumenFinanzas = {
  generado_en: string; modoPrueba: boolean;
  pagados: number; pendientes: number; documentacionIncompleta: number; sinCedulaValidada: number; pagosSinImporteEur: number; totalEur: string; filas: FilaFinanzas[];
};

// El total y «pagados» salen SOLO de pagos_confirmados: generar o imprimir actas no los mueve (§7.5, §13.9).
export async function resumenFinanzas(): Promise<ResumenFinanzas> {
  const filas = await query<FilaFinanzas>(
    `SELECT m.id, m.cedula, m.apellidos, m.nombres, m.apellidos || ', ' || m.nombres AS nombre, jv.serie || jv.numero AS junta,
            CASE WHEN p.id IS NOT NULL THEN 'pagada'
                 WHEN d.n < 2 THEN 'documentacion_incompleta'
                 WHEN EXISTS (SELECT 1 FROM actas_pago a WHERE a.mjrv_id = m.id) THEN 'acta_preparada'
                 ELSE 'lista' END AS estado,
            p.importe_eur::text AS eur, p.confirmado_en::text AS hora, coalesce(nullif(btrim(o.nombre || ' ' || o.apellido), ''), u.nombre) AS operador, coalesce(p.es_prueba, false) AS simulado,
            (m.cedula_validada_en IS NOT NULL) AS "cedulaValidada", (d.n = 2) AS "fotosCompletas"
       FROM mjrv m
       JOIN juntas_madrid jv ON jv.id = coalesce((SELECT x.junta_destino_id FROM decisiones_movimiento x WHERE x.mjrv_id = m.id AND x.decision = 'aceptada' ORDER BY x.creado_en DESC, x.id DESC LIMIT 1), m.junta_origen_id)
       CROSS JOIN LATERAL (SELECT count(DISTINCT lado)::int AS n FROM documentos_mjrv WHERE mjrv_id = m.id) d
       LEFT JOIN pagos_confirmados p ON p.mjrv_id = m.id
       LEFT JOIN operadores_madrid o ON o.id = p.operador_id
       LEFT JOIN usuarios u ON u.id = p.usuario_id
      WHERE m.activo OR p.id IS NOT NULL
      ORDER BY (p.id IS NULL) DESC, p.confirmado_en DESC, m.apellidos`);
  const total = (await query<{ total: string }>("SELECT coalesce(sum(importe_eur), 0)::text AS total FROM pagos_confirmados"))[0].total;
  return {
    generado_en: new Date().toISOString(), modoPrueba: (await leerModo()) === "prueba",
    pagados: filas.filter((f) => f.estado === "pagada").length,
    pendientes: filas.filter((f) => f.estado !== "pagada").length,
    documentacionIncompleta: filas.filter((f) => f.estado === "documentacion_incompleta").length,
    sinCedulaValidada: filas.filter((f) => !f.cedulaValidada).length,
    pagosSinImporteEur: filas.filter((f) => f.estado === "pagada" && f.eur === null).length,
    totalEur: total, filas,
  };
}
