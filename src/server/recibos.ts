import { PDFDocument } from "pdf-lib";
import type { PoolClient } from "pg";
import { numeroActa } from "../domain/recibos";
import { registrarAuditoria } from "./auditoria";
import type { Sesion } from "./auth";
import type { Modo } from "./config";
import { decryptBuffer } from "./crypto";
import { query, withTx } from "./db";
import { actaPago, type DatosActa } from "./pdf/acta";
import { crearZip } from "./zip";

export type TipoRecibo = "acta" | "firma";
type ReferenciaRecibo = { id: number; tipo: TipoRecibo };
export type ReciboFila = ReferenciaRecibo & {
  numero: string; nombre: string; cedula: string; emitido: Date;
  importe: string | null; importeUsd: string | null; pagado: boolean | null; reconstruido: boolean; historico: boolean;
};
const POR_PAGINA = 30;

const filtroRecibos = (q: string) => `%${q.trim().slice(0, 120).replace(/[\\%_]/g, "\\$&")}%`;

// Las políticas de la base filtran actas, firmas y pagos por el modo vigente.
const SQL_COINCIDENCIAS = `WITH recibos AS (
       SELECT a.id, 'acta' AS tipo,
              (CASE WHEN a.es_prueba THEN 'PRUEBA-' ELSE 'MAD-' END) ||
                lpad(a.id::text, greatest(6, length(a.id::text)), '0') AS numero,
              a.mjrv_id, a.creado_en AS emitido, a.importe_eur::text AS importe, a.importe_usd::text AS "importeUsd",
              a.recibo_cifrado IS NULL AS reconstruido, NOT a.recibo_principal AS historico
         FROM actas_pago a
       UNION ALL
       SELECT f.id, 'firma', 'FIRMA-' || f.id, f.mjrv_id, f.creado_en, NULL, NULL, false, true
         FROM firmas_recibo f WHERE f.acta_id IS NULL
     ), coincidencias AS (
       SELECT r.*, m.apellidos || ', ' || m.nombres AS nombre, m.cedula
         FROM recibos r JOIN mjrv m ON m.id = r.mjrv_id
        WHERE r.numero ILIKE $1 OR m.cedula ILIKE $1
           OR (m.apellidos || ' ' || m.nombres) ILIKE $1 OR (m.nombres || ' ' || m.apellidos) ILIKE $1
     )
`;

export async function buscarRecibos(q: string, pagina: number): Promise<{ filas: ReciboFila[]; total: number; modo: Modo; siguiente: boolean }> {
  type Fila = { modo: Modo; total: number } & (ReciboFila | { id: null });
  const filas = await query<Fila>(
    `${SQL_COINCIDENCIAS}
     SELECT c.modo, t.total, r.id, r.tipo, r.numero, r.emitido, r.importe, r."importeUsd", r.reconstruido, r.historico,
            r.nombre, r.cedula,
            CASE WHEN r.tipo = 'acta' THEN EXISTS (
              SELECT 1 FROM pagos_confirmados p WHERE p.acta_id = r.id
            ) END AS pagado
       FROM configuracion c
       CROSS JOIN (SELECT count(*)::int AS total FROM coincidencias) t
       LEFT JOIN (
         SELECT * FROM coincidencias ORDER BY emitido DESC, id DESC, tipo LIMIT $2 OFFSET $3
       ) r ON true
      WHERE c.id = 1
      ORDER BY r.emitido DESC, r.id DESC, r.tipo`,
    [filtroRecibos(q), POR_PAGINA, (pagina - 1) * POR_PAGINA]);
  const { modo, total } = filas[0];
  const recibos = filas.flatMap((r) => r.id === null ? [] : [{
    id: r.id, tipo: r.tipo, numero: r.numero, nombre: r.nombre, cedula: r.cedula, emitido: r.emitido,
    importe: r.importe, importeUsd: r.importeUsd, pagado: r.pagado, reconstruido: r.reconstruido, historico: r.historico,
  }]);
  return { filas: recibos, total, modo, siguiente: pagina * POR_PAGINA < total };
}

export async function descargarRecibo(tipo: TipoRecibo, id: number, client?: PoolClient): Promise<{ numero: string; pdf: Uint8Array } | null> {
  const consultar = client ? async <T extends object>(sql: string, params: unknown[]) => (await client.query<T>(sql, params)).rows : query;
  if (tipo === "firma") {
    const [f] = await consultar<{ pdf: Buffer }>("SELECT pdf FROM firmas_recibo WHERE id = $1 AND acta_id IS NULL", [id]);
    if (!f) return null;
    const original = await PDFDocument.load(f.pdf);
    const recibo = await PDFDocument.create();
    const [pagina] = await recibo.copyPages(original, [0]);
    recibo.addPage(pagina);
    return { numero: `FIRMA-${id}`, pdf: await recibo.save() };
  }

  const [a] = await consultar<{
    creado_en: Date; es_prueba: boolean; impresion_n: number; importe_eur: string | null; importe_usd: string | null;
    parametros: { pagador_nombre?: string | null; pagador_cargo?: string | null; persona_recibo?: DatosActa["persona"]; contingencia?: boolean };
    recibo_cifrado: Buffer | null; recibo_nonce: Buffer | null;
    apellidos: string; nombres: string; cedula: string; cargo: string; junta: string;
  }>(
    `SELECT a.creado_en, a.es_prueba, a.impresion_n, a.importe_eur::text, a.importe_usd::text, a.parametros,
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
    numero, impresionN: a.impresion_n, prueba: a.es_prueba, borrador: !a.importe_eur, emitidaEn: a.creado_en, reconstruido: true,
    persona: a.parametros?.persona_recibo ?? { apellidos: a.apellidos, nombres: a.nombres, cedula: a.cedula, cargo: a.cargo, juntaVigente: a.junta },
    contingencia: a.parametros?.contingencia,
    importe: { eur: a.importe_eur, usd: a.importe_usd },
    pagador: nombrePagador ? { nombre: nombrePagador, cargo: a.parametros.pagador_cargo ?? "" } : null,
  });
  return { numero, pdf };
}

export type SeleccionRecibosEmitidos = { modo: Modo } & ({ referencias: ReferenciaRecibo[] } | { q: string; total: number });
type ResultadoDescarga =
  | { ok: true; tipo: "application/pdf"; nombre: string; contenido: Buffer<ArrayBuffer> }
  | { ok: true; tipo: "application/zip"; nombre: string; contenido: ReadableStream<Uint8Array<ArrayBuffer>> }
  | { ok: false; status: 404 | 409; mensaje: string };

export async function descargarSeleccionRecibos(sesion: Sesion, seleccion: SeleccionRecibosEmitidos): Promise<ResultadoDescarga> {
  return withTx(async (client) => {
    const { rows: [config] } = await client.query<{ modo: Modo }>("SELECT modo FROM configuracion WHERE id = 1 FOR SHARE");
    if (config.modo !== seleccion.modo) return { ok: false, status: 409, mensaje: "El modo cambió. Actualice la lista de recibos antes de descargar." };

    const referencias = "referencias" in seleccion ? seleccion.referencias
      : (await client.query<ReferenciaRecibo>(
        `${SQL_COINCIDENCIAS} SELECT id, tipo FROM coincidencias ORDER BY emitido DESC, id DESC, tipo`, [filtroRecibos(seleccion.q)])).rows;
    if ("total" in seleccion && referencias.length !== seleccion.total) {
      return { ok: false, status: 409, mensaje: "La búsqueda cambió. Actualice la lista de recibos y seleccione de nuevo." };
    }

    const archivos: { nombre: string; bytes: Uint8Array }[] = [];
    for (const { tipo, id } of referencias) {
      const recibo = await descargarRecibo(tipo, id, client);
      if (!recibo) return { ok: false, status: 404, mensaje: "Algún recibo seleccionado ya no está disponible en el modo actual." };
      archivos.push({ nombre: `recibo-${recibo.numero}.pdf`, bytes: recibo.pdf });
    }
    for (const { tipo, id } of referencias) {
      await registrarAuditoria({ portal: "finanzas", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre,
        accion: "recibo_descargado", entidad: tipo === "acta" ? "actas_pago" : "firmas_recibo", entidadId: id }, client);
    }
    if (archivos.length === 1) {
      const [archivo] = archivos;
      return { ok: true, tipo: "application/pdf", nombre: archivo.nombre, contenido: Buffer.from(archivo.bytes) };
    }
    return { ok: true, tipo: "application/zip", nombre: `recibos-${config.modo}.zip`, contenido: crearZip(archivos) };
  });
}
