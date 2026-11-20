import { PDFDocument } from "pdf-lib";
import { numeroActa } from "../domain/recibos";
import { decryptBuffer } from "./crypto";
import { query } from "./db";
import { actaPago, type DatosActa } from "./pdf/acta";

export type TipoRecibo = "acta" | "firma";
type ReciboFila = {
  id: number; tipo: TipoRecibo; numero: string; nombre: string; cedula: string; emitido: Date;
  importe: string | null; pagado: boolean | null; reconstruido: boolean; historico: boolean;
};
const POR_PAGINA = 30;

// El rol de base de la aplicación filtra actas, firmas y pagos por el modo vigente.
export async function buscarRecibos(q: string, pagina: number): Promise<{ filas: ReciboFila[]; siguiente: boolean }> {
  const filtro = q.trim().slice(0, 120).replace(/[\\%_]/g, "\\$&");
  const filas = await query<ReciboFila>(
    `WITH recibos AS (
       SELECT a.id, 'acta' AS tipo,
              (CASE WHEN a.es_prueba THEN 'PRUEBA-' ELSE 'MAD-' END) ||
                lpad(a.id::text, greatest(6, length(a.id::text)), '0') AS numero,
              a.mjrv_id, a.creado_en AS emitido, a.importe_eur::text AS importe,
              a.recibo_cifrado IS NULL AS reconstruido, NOT a.recibo_principal AS historico
         FROM actas_pago a
       UNION ALL
       SELECT f.id, 'firma', 'FIRMA-' || f.id, f.mjrv_id, f.creado_en, NULL, false, true
         FROM firmas_recibo f WHERE f.acta_id IS NULL
     )
     SELECT r.id, r.tipo, r.numero, r.emitido, r.importe, r.reconstruido, r.historico,
            m.apellidos || ', ' || m.nombres AS nombre, m.cedula,
            CASE WHEN r.tipo = 'acta' THEN EXISTS (
              SELECT 1 FROM pagos_confirmados p WHERE p.acta_id = r.id
            ) END AS pagado
       FROM recibos r JOIN mjrv m ON m.id = r.mjrv_id
      WHERE $1 = '' OR r.numero ILIKE $2 OR m.cedula ILIKE $2
         OR (m.apellidos || ' ' || m.nombres) ILIKE $2 OR (m.nombres || ' ' || m.apellidos) ILIKE $2
      ORDER BY r.emitido DESC, r.id DESC, r.tipo
      LIMIT $3 OFFSET $4`,
    [filtro, `%${filtro}%`, POR_PAGINA + 1, (pagina - 1) * POR_PAGINA]);
  return { filas: filas.slice(0, POR_PAGINA), siguiente: filas.length > POR_PAGINA };
}

export async function descargarRecibo(tipo: TipoRecibo, id: number): Promise<{ numero: string; pdf: Uint8Array } | null> {
  if (tipo === "firma") {
    const [f] = await query<{ pdf: Buffer }>("SELECT pdf FROM firmas_recibo WHERE id = $1 AND acta_id IS NULL", [id]);
    if (!f) return null;
    const original = await PDFDocument.load(f.pdf);
    const recibo = await PDFDocument.create();
    const [pagina] = await recibo.copyPages(original, [0]);
    recibo.addPage(pagina);
    return { numero: `FIRMA-${id}`, pdf: await recibo.save() };
  }

  const [a] = await query<{
    creado_en: Date; es_prueba: boolean; impresion_n: number; importe: string | null;
    parametros: { pagador_nombre?: string | null; pagador_cargo?: string | null; persona_recibo?: DatosActa["persona"]; contingencia?: boolean };
    recibo_cifrado: Buffer | null; recibo_nonce: Buffer | null;
    apellidos: string; nombres: string; cedula: string; cargo: string; junta: string;
  }>(
    `SELECT a.creado_en, a.es_prueba, a.impresion_n, a.importe_eur::text AS importe, a.parametros,
            a.recibo_cifrado, a.recibo_nonce, m.apellidos, m.nombres, m.cedula, m.cargo_original AS cargo,
            j.serie || j.numero AS junta
       FROM actas_pago a JOIN mjrv m ON m.id = a.mjrv_id
       JOIN juntas_madrid j ON j.id = coalesce((
         SELECT d.junta_destino_id FROM decisiones_movimiento d
         WHERE d.mjrv_id = m.id AND d.decision = 'aceptada' AND d.creado_en <= a.creado_en
         ORDER BY d.creado_en DESC, d.id DESC LIMIT 1
       ), m.junta_origen_id)
      WHERE a.id = $1`, [id]);
  if (!a) return null;
  const numero = numeroActa(id, a.es_prueba);
  if (a.recibo_cifrado && a.recibo_nonce) return { numero, pdf: decryptBuffer(a.recibo_cifrado, a.recibo_nonce) };
  const nombrePagador = a.parametros?.pagador_nombre;
  const pdf = await actaPago({
    numero, impresionN: a.impresion_n, prueba: a.es_prueba, borrador: !a.importe, emitidaEn: a.creado_en, reconstruido: true,
    persona: a.parametros?.persona_recibo ?? { apellidos: a.apellidos, nombres: a.nombres, cedula: a.cedula, cargo: a.cargo, juntaVigente: a.junta },
    contingencia: a.parametros?.contingencia,
    importe: a.importe ? { eur: a.importe } : null,
    pagador: nombrePagador ? { nombre: nombrePagador, cargo: a.parametros.pagador_cargo ?? "" } : null,
  });
  return { numero, pdf };
}
