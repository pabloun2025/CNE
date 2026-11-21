import { PDFDocument } from "pdf-lib";
import type { PoolClient } from "pg";
import { faltanDatosRecibo, type ParametrosPago } from "../domain/pago";
import { registrarAuditoria } from "./auditoria";
import { documentosParaRecibo, estadoDocumentos } from "./documentos";
import { withTx } from "./db";
import type { SesionEstacion } from "./estaciones";
import type { Modo } from "./config";
import { leerParametros } from "./pago";
import { actaPago, type DatosActa } from "./pdf/acta";
import { normalizarFechaRecibo } from "./pdf/fecha-recibo";
import { decryptBuffer, encryptBuffer } from "./crypto";
import { CUPO_RECIBOS, importeReciboEUR, numeroActa, RECIBOS_IMPORTE_USD, RECIBOS_TIPO_CAMBIO } from "../domain/recibos";
import { anexoDeRecibo } from "./recibos";

// La ventanilla es un enlace, o la cuenta de financiero / cónsul en el módulo de pago.
export type ActorPago = {
  enlaceId: number | null;
  operadorId: number | null;
  operadorNombre: string;
  usuarioId?: number | null;
};

const SQL_QUIEN = `coalesce(nullif(btrim(o.nombre || ' ' || o.apellido), ''), u.nombre)`;
const JOIN_QUIEN = `LEFT JOIN operadores_madrid o ON o.id = p.operador_id LEFT JOIN usuarios u ON u.id = p.usuario_id`;

function puestoDe(s: SesionEstacion | ActorPago): { enlaceId: number | null; usuarioId: number | null; operadorId: number | null; nombre: string } {
  return {
    enlaceId: s.enlaceId,
    usuarioId: "usuarioId" in s ? (s.usuarioId ?? null) : null,
    operadorId: s.operadorId,
    nombre: s.operadorNombre,
  };
}

export type EstadoPago = "documentacion_incompleta" | "lista" | "acta_preparada" | "pagada";

export type FichaPago = {
  mjrvId: number; cedula: string; apellidos: string; nombres: string; nombre: string; cargo: string; juntaOrigen: string; juntaVigente: string; activo: boolean;
  anverso: boolean; reverso: boolean; pasaporte?: true; documentosCompletos: boolean; cedulaValidada: boolean;
  parametrosCompletos: boolean; faltanParametros: string[]; importeUsd: string | null; importeEur: string | null; tipoCambio: string | null;
  acta: { id: number; impresionN: number; importePendiente: boolean; documentoPendiente?: true; numero: string; ordinalRecibo: number | null } | null;
  pago: { en: string; operador: string; importeUsd: string; importeEur: string | null; simulado: boolean } | null;
  estado: EstadoPago; modoPrueba: boolean; serieAgotada: boolean;
  // Otros puestos con esta ficha abierta hace menos de 5 minutos.
  otrosPuestos: { etiqueta: string; operador: string; haceMin: number }[];
};

const cedulaNorm = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "").slice(0, 20);

type Puesto = { enlaceId: number | null; usuarioId: number | null };

// Quien abrió la ficha antes puede emitir. Quien llegó después espera mientras esa apertura siga vigente.
async function otroPagoEnCurso(client: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }, mjrvId: number, p: Puesto): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM fichas_abiertas_finanzas o
      WHERE o.mjrv_id = $1
        AND o.abierta_en > now() - make_interval(mins => $3)
        AND o.abierta_en < COALESCE((
              SELECT y.abierta_en FROM fichas_abiertas_finanzas y
               WHERE y.mjrv_id = $1
                 AND (($2::bigint IS NOT NULL AND y.enlace_id = $2) OR ($4::bigint IS NOT NULL AND y.usuario_id = $4))
            ), now())
        AND (CASE WHEN $2::bigint IS NOT NULL THEN o.enlace_id IS DISTINCT FROM $2 ELSE TRUE END)
        AND (CASE WHEN $4::bigint IS NOT NULL THEN o.usuario_id IS DISTINCT FROM $4 ELSE TRUE END)`,
    [mjrvId, p.enlaceId, MINUTOS_AVISO, p.usuarioId],
  );
  return r.rows.length > 0;
}

async function anotarApertura(client: PoolClient, mjrvId: number, p: Puesto & { nombre: string }) {
  if (p.enlaceId != null) {
    await client.query(
      `INSERT INTO fichas_abiertas_finanzas (mjrv_id, enlace_id, operador_nombre) VALUES ($1, $2, $3)
       ON CONFLICT (mjrv_id, enlace_id, es_prueba) DO UPDATE SET operador_nombre = EXCLUDED.operador_nombre, abierta_en = now()`,
      [mjrvId, p.enlaceId, p.nombre],
    );
    return;
  }
  await client.query(
    `INSERT INTO fichas_abiertas_finanzas (mjrv_id, usuario_id, operador_nombre) VALUES ($1,$2,$3)
     ON CONFLICT (mjrv_id, usuario_id, es_prueba) WHERE usuario_id IS NOT NULL
       DO UPDATE SET operador_nombre = EXCLUDED.operador_nombre, abierta_en = now()`,
    [mjrvId, p.usuarioId, p.nombre],
  );
}

export const MINUTOS_AVISO = 5;

// Abrir la ficha queda anotado para avisar a los demás puestos que están revisando los datos.
export async function fichaPago(cedulaBruta: string, s?: SesionEstacion | ActorPago): Promise<FichaPago | null> {
  return withTx(async (client) => {
    // La consulta y la apertura usan el mismo modo y no se intercalan con el reinicio.
    await client.query("SELECT modo FROM configuracion WHERE id = 1 FOR SHARE");
    return leerFichaPago(client, cedulaBruta, s);
  });
}

async function leerFichaPago(client: PoolClient, cedulaBruta: string, s?: SesionEstacion | ActorPago): Promise<FichaPago | null> {
  const { rows: [m] } = await client.query<{ id: number; cedula: string; apellidos: string; nombres: string; cargo_original: string; activo: boolean; origen: string; vigente: string }>(
    `SELECT m.id, m.cedula, m.apellidos, m.nombres, m.cargo_original, m.activo, jo.serie || jo.numero AS origen,
            jv.serie || jv.numero AS vigente
       FROM mjrv m JOIN juntas_madrid jo ON jo.id = m.junta_origen_id
       JOIN juntas_madrid jv ON jv.id = coalesce((SELECT d.junta_destino_id FROM decisiones_movimiento d WHERE d.mjrv_id = m.id AND d.decision = 'aceptada' ORDER BY d.creado_en DESC, d.id DESC LIMIT 1), m.junta_origen_id)
      WHERE m.cedula = $1 FOR KEY SHARE OF m`, [cedulaNorm(cedulaBruta)]);
  if (!m) return null;
  const { anverso, reverso, pasaporte, completos: documentosCompletos } = await estadoDocumentos(m.id, client);
  const { rowCount: documentosValidados } = await client.query("SELECT 1 FROM v_cedulas_validadas WHERE mjrv_id = $1", [m.id]);
  const params = await leerParametros(client);
  const { rows: [serie] } = await client.query<{ es_prueba: boolean; ultimo_ordinal: number }>(
    "SELECT es_prueba, ultimo_ordinal FROM secuencia_recibos WHERE es_prueba = cne.en_prueba()");
  const { rows: [acta] } = await client.query<{ id: number; impresion_n: number; ordinal_recibo: number | null; importe_usd: string | null; importe_eur: string | null; tipo_cambio: string | null; documento_pendiente: boolean }>(
    `SELECT a.id, a.impresion_n, a.ordinal_recibo, a.importe_usd::text, a.importe_eur::text, a.tipo_cambio::text,
            EXISTS (SELECT 1 FROM v_identidad_recibo_pendiente i WHERE i.acta_id = a.id) AS documento_pendiente
       FROM actas_pago a WHERE a.mjrv_id = $1 AND a.recibo_principal`, [m.id]);
  const { rows: [pago] } = await client.query<{ en: string; operador: string; importe_usd: string | null; importe_eur: string | null; es_prueba: boolean }>(
    `SELECT p.confirmado_en::text AS en, ${SQL_QUIEN} AS operador, p.importe_usd::text, p.importe_eur::text, p.es_prueba FROM pagos_confirmados p ${JOIN_QUIEN} WHERE p.mjrv_id = $1`, [m.id]);
  const estado: EstadoPago = pago ? "pagada" : !documentosCompletos ? "documentacion_incompleta" : acta ? "acta_preparada" : "lista";
  const faltan = acta?.importe_eur ? [] : faltanDatosRecibo(params);
  let otrosPuestos: FichaPago["otrosPuestos"] = [];
  if (s) {
    const p = puestoDe(s);
    await anotarApertura(client, m.id, p);
    otrosPuestos = (await client.query<{ etiqueta: string; operador: string; hace_min: number }>(
      `SELECT coalesce(e.etiqueta, 'Módulo de pago') AS etiqueta, f.operador_nombre AS operador,
              floor(extract(epoch FROM now() - f.abierta_en) / 60)::int AS hace_min
         FROM fichas_abiertas_finanzas f LEFT JOIN enlaces_estacion e ON e.id = f.enlace_id
        WHERE f.mjrv_id = $1 AND f.abierta_en > now() - make_interval(mins => $3)
          AND (CASE WHEN $2::bigint IS NOT NULL THEN f.enlace_id IS DISTINCT FROM $2 ELSE TRUE END)
          AND (CASE WHEN $4::bigint IS NOT NULL THEN f.usuario_id IS DISTINCT FROM $4 ELSE TRUE END)
        ORDER BY f.abierta_en DESC`, [m.id, p.enlaceId, MINUTOS_AVISO, p.usuarioId]))
      .rows.map((x) => ({ etiqueta: x.etiqueta, operador: x.operador, haceMin: x.hace_min }));
  }
  return {
    mjrvId: m.id, cedula: m.cedula, apellidos: m.apellidos, nombres: m.nombres, nombre: `${m.apellidos}, ${m.nombres}`, cargo: m.cargo_original, juntaOrigen: m.origen, juntaVigente: m.vigente, activo: m.activo,
    anverso, reverso, ...(pasaporte ? { pasaporte } : {}), documentosCompletos, cedulaValidada: !!documentosValidados,
    parametrosCompletos: faltan.length === 0, faltanParametros: faltan,
    importeUsd: acta ? acta.importe_usd : RECIBOS_IMPORTE_USD,
    importeEur: acta?.importe_eur ?? null,
    tipoCambio: !acta || acta.ordinal_recibo !== null ? RECIBOS_TIPO_CAMBIO : acta.tipo_cambio,
    acta: acta ? { id: acta.id, impresionN: acta.impresion_n, importePendiente: !acta.importe_eur,
      ...(acta.documento_pendiente ? { documentoPendiente: true } : {}),
      numero: numeroActa(acta.id, serie.es_prueba, acta.ordinal_recibo), ordinalRecibo: acta.ordinal_recibo } : null,
    pago: pago ? { en: pago.en, operador: pago.operador, importeUsd: pago.importe_usd ?? "", importeEur: pago.importe_eur, simulado: pago.es_prueba } : null,
    estado, modoPrueba: serie.es_prueba, serieAgotada: serie.ultimo_ordinal >= CUPO_RECIBOS, otrosPuestos,
  };
}

export type ResultadoActa = { ok: true; pdf: Uint8Array; borrador: boolean; numero: string; actaId: number | null } | { ok: false; status: 400 | 404 | 409; mensaje: string };

type DatosGuardados = ParametrosPago & { persona_recibo?: DatosActa["persona"]; contingencia?: boolean };
type ActaEmitida = {
  id: number; impresion_n: number; creado_en: Date; importe_usd: string | null; importe_eur: string | null; parametros: DatosGuardados;
  recibo_cifrado: Buffer | null; recibo_nonce: Buffer | null; ordinal_recibo: number | null; tipo_cambio: string | null;
};
const CAMPOS_ACTA = "id, impresion_n, creado_en, importe_usd::text, importe_eur::text, tipo_cambio::text, parametros, recibo_cifrado, recibo_nonce, ordinal_recibo";
const SQL_IDENTIDAD_PENDIENTE = "SELECT 1 FROM v_identidad_recibo_pendiente WHERE acta_id = $1";

async function contextoEmision(client: PoolClient) {
  // El modo permanece fijo durante la emisión, incluso cuando se genera un lote.
  return (await client.query<{ prueba: boolean; modo_recibo: string }>(
    "SELECT modo = 'prueba' AS prueba, modo_recibo FROM configuracion WHERE id = 1 FOR SHARE")).rows[0];
}

async function bloquearSerie(client: PoolClient) {
  const modo = await contextoEmision(client);
  // La serie se bloquea antes que cualquier ficha: un lote puede reservar varios ordinales sin intercalarlos.
  await client.query("SELECT ultimo_ordinal FROM secuencia_recibos WHERE es_prueba = $1 FOR UPDATE", [modo.prueba]);
  return modo;
}

async function emitirActa(client: PoolClient, s: SesionEstacion | ActorPago, mjrvId: number, params: ParametrosPago,
  modo: Awaited<ReturnType<typeof contextoEmision>>, opciones: { contingencia?: boolean; firma?: Buffer }): Promise<ResultadoActa> {
  const { contingencia = false, firma } = opciones;
  if (firma && modo.modo_recibo !== "digital") return { ok: false, status: 409, mensaje: "El modo digital no está activado." };
  const quien = puestoDe(s);
  const [m] = (await client.query<{ cedula: string; apellidos: string; nombres: string; cargo_original: string; activo: boolean; telefono_e164: string | null; correo: string | null }>(
    "SELECT cedula, apellidos, nombres, cargo_original, activo, telefono_e164, correo FROM mjrv WHERE id = $1 FOR UPDATE", [mjrvId])).rows;
  if (!m) return { ok: false, status: 404, mensaje: "La ficha no existe." };

  const [principal] = (await client.query<ActaEmitida>(`SELECT ${CAMPOS_ACTA} FROM actas_pago WHERE mjrv_id = $1 AND recibo_principal`, [mjrvId])).rows;
  if (!m.activo && !(contingencia && principal)) return { ok: false, status: 404, mensaje: "La ficha está de baja." };
  const faltan = faltanDatosRecibo(params);
  const borradorLegado = principal && !principal.importe_eur && m.activo && !faltan.length;
  const pagado = (!contingencia || borradorLegado) && (await client.query("SELECT 1 FROM pagos_confirmados WHERE mjrv_id = $1", [mjrvId])).rows[0];
  const sustituirBorrador = borradorLegado && !pagado;
  const existente = sustituirBorrador ? undefined : principal;
  if (!contingencia) {
    if (pagado) return { ok: false, status: 409, mensaje: "Esta persona ya tiene el pago confirmado. Busque su recibo para reimprimirlo." };
    if (existente?.ordinal_recibo == null && await otroPagoEnCurso(client, mjrvId, quien)) {
      return { ok: false, status: 409, mensaje: "Otra persona está haciendo este pago. No se puede continuar." };
    }
    await client.query("SELECT 1 FROM documentos_mjrv WHERE mjrv_id = $1 AND es_prueba = cne.en_prueba() FOR SHARE", [mjrvId]);
  }

  const fotos = await documentosParaRecibo(mjrvId, client);
  if (!contingencia && !fotos?.pasaporte && !(fotos?.anverso && fotos.reverso)) {
    return { ok: false, status: 409, mensaje: "Faltan fotos del documento de identidad. No se puede generar el acta." };
  }

  if (!existente && faltan.length && (contingencia || firma)) {
    return { ok: false, status: 409, mensaje: `Configure ${faltan.join(" y ")} antes de emitir recibos.` };
  }
  if (firma && existente && !existente.importe_eur) return { ok: false, status: 409, mensaje: "El recibo histórico carece de importe en EUR." };

  const actualizarDocumento = !!(existente && !contingencia && (await client.query(SQL_IDENTIDAD_PENDIENTE, [existente.id])).rowCount);
  if (existente) {
    const numero = numeroActa(existente.id, modo.prueba, existente.ordinal_recibo);
    const firmado = !contingencia
      ? (await client.query<{ pdf: Buffer }>("SELECT pdf FROM firmas_recibo WHERE acta_id = $1", [existente.id])).rows[0]
      : undefined;
    if (firmado && actualizarDocumento) return { ok: false, status: 409, mensaje: "El recibo firmado corresponde a otro documento. Revise el caso antes de pagar." };
    await client.query("UPDATE actas_pago SET impresion_n = impresion_n + 1 WHERE id = $1", [existente.id]);
    await registrarAuditoria({ portal: "finanzas", actorTipo: quien.usuarioId ? "usuario" : "operador", actorId: quien.usuarioId ?? quien.operadorId,
      actorNombre: quien.nombre, accion: "acta_reimpresa", entidad: "actas_pago", entidadId: existente.id,
      datos: actualizarDocumento ? { contingencia, documentoActualizado: true } : { contingencia } }, client);
    if (firmado) return { ok: true, pdf: await normalizarFechaRecibo(firmado.pdf, existente.parametros.contingencia), borrador: false, numero, actaId: existente.id };
  }

  const [j] = (await client.query<{ vigente: string }>(
    `SELECT jv.serie || jv.numero AS vigente FROM mjrv m JOIN juntas_madrid jv ON jv.id = coalesce((
       SELECT d.junta_destino_id FROM decisiones_movimiento d
        WHERE d.mjrv_id = m.id AND d.decision = 'aceptada' AND ($2::timestamptz IS NULL OR d.creado_en <= $2)
        ORDER BY d.creado_en DESC, d.id DESC LIMIT 1), m.junta_origen_id) WHERE m.id = $1`, [mjrvId, existente?.creado_en ?? null])).rows;
  const personaActual = { apellidos: m.apellidos, nombres: m.nombres, cedula: m.cedula, cargo: m.cargo_original, juntaVigente: j.vigente,
    telefono: m.telefono_e164 ?? undefined, correo: m.correo ?? undefined };
  const persona: DatosActa["persona"] = { ...(existente?.parametros.persona_recibo ?? personaActual) };
  if (!existente || actualizarDocumento) {
    if (fotos?.pasaporte) persona.tipoDocumento = "pasaporte";
    else if (fotos?.anverso && fotos.reverso) persona.tipoDocumento = "cedula";
  }
  if (actualizarDocumento || persona.tipoDocumento === "pasaporte") persona.cedula = m.cedula;
  const anexo = anexoDeRecibo(persona, fotos);
  if (contingencia && !anexo && existente?.recibo_cifrado && existente.recibo_nonce) {
    const pdf = await normalizarFechaRecibo(decryptBuffer(existente.recibo_cifrado, existente.recibo_nonce), existente.parametros.contingencia);
    return { ok: true, pdf, borrador: !existente.importe_eur,
      numero: numeroActa(existente.id, modo.prueba, existente.ordinal_recibo), actaId: existente.id };
  }
  const guardados = existente?.parametros ?? { ...params, persona_recibo: persona, contingencia };
  let acta = existente;
  if (!acta && !faltan.length) {
    const [serie] = (await client.query<{ ultimo_ordinal: number }>(
      `UPDATE secuencia_recibos SET ultimo_ordinal = ultimo_ordinal + 1
       WHERE es_prueba = $1 AND ultimo_ordinal < $2 RETURNING ultimo_ordinal`, [modo.prueba, CUPO_RECIBOS])).rows;
    if (!serie) return { ok: false, status: 409, mensaje: `Se agotó el cupo de ${CUPO_RECIBOS} recibos. Puede reimprimir los ya emitidos.` };
    const ordinal = serie.ultimo_ordinal;
    const importeEur = importeReciboEUR(ordinal);
    if (sustituirBorrador) await client.query("UPDATE actas_pago SET recibo_principal = false WHERE id = $1", [principal.id]);
    const parametros = { ...guardados, importe_usd: RECIBOS_IMPORTE_USD, importe_eur: importeEur, tipo_cambio: RECIBOS_TIPO_CAMBIO };
    [acta] = (await client.query<ActaEmitida>(
      `INSERT INTO actas_pago (mjrv_id, operador_id, usuario_id, importe_usd, importe_eur, tipo_cambio, parametros, ordinal_recibo, impresion_n, creado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,1,clock_timestamp()) RETURNING ${CAMPOS_ACTA}`,
      [mjrvId, quien.operadorId, quien.usuarioId, RECIBOS_IMPORTE_USD, importeEur, RECIBOS_TIPO_CAMBIO, JSON.stringify(parametros), ordinal])).rows;
    await registrarAuditoria({ portal: "finanzas", actorTipo: quien.usuarioId ? "usuario" : "operador", actorId: quien.usuarioId ?? quien.operadorId,
      actorNombre: quien.nombre, accion: "acta_generada", entidad: "actas_pago", entidadId: acta.id, datos: { mjrv: mjrvId, contingencia, ordinal } }, client);
  }
  const ordinalRecibo = acta?.ordinal_recibo ?? null;
  const numero = numeroActa(acta?.id ?? null, modo.prueba, ordinalRecibo);
  const importe = acta?.importe_eur;
  const datos: DatosActa = {
    numero, impresionN: existente ? existente.impresion_n + 1 : 1, prueba: modo.prueba, borrador: !importe,
    emitidaEn: acta?.creado_en ?? new Date(), persona,
    importe: { usd: acta?.importe_usd ?? null, eur: importe ?? null, cambio: ordinalRecibo === null ? acta?.tipo_cambio : RECIBOS_TIPO_CAMBIO },
    ordinalRecibo,
    pagador: guardados.pagador_nombre ? { nombre: guardados.pagador_nombre, cargo: guardados.pagador_cargo ?? "" } : null,
    firmaReceptor: firma, contingencia: guardados.contingencia, reconstruido: !!existente && !guardados.persona_recibo,
  };
  const pdf = await actaPago({ ...datos, anexo });
  if (acta && (!existente || actualizarDocumento || firma)) {
    const recibo = anexo ? await actaPago({ ...datos, impresionN: 1 }) : pdf;
    const { ciphertext, nonce } = encryptBuffer(Buffer.from(recibo));
    await client.query(
      `UPDATE actas_pago SET recibo_cifrado = $2, recibo_nonce = $3,
         parametros = CASE WHEN $4::jsonb IS NOT NULL THEN jsonb_set(parametros, '{persona_recibo}', $4) ELSE parametros END
       WHERE id = $1`, [acta.id, ciphertext, nonce, actualizarDocumento ? JSON.stringify(persona) : null]);
  }
  if (acta && firma) {
    await client.query("INSERT INTO firmas_recibo (mjrv_id, usuario_id, pdf, acta_id, es_prueba) VALUES ($1,$2,$3,$4,$5)",
      [mjrvId, quien.usuarioId, Buffer.from(pdf), acta.id, modo.prueba]);
  }
  return { ok: true, pdf, borrador: !importe, numero, actaId: acta?.id ?? null };
}

export async function generarActa(s: SesionEstacion | ActorPago, mjrvId: number, verificado: boolean,
  opciones: { firma?: Buffer; modoEsperado?: Modo } = {}): Promise<ResultadoActa> {
  if (!verificado) return { ok: false, status: 400, mensaje: "Marque «He verificado que cumplió sus funciones»." };
  if (!Number.isSafeInteger(mjrvId) || mjrvId < 1) return { ok: false, status: 400, mensaje: "Elija una ficha válida." };
  const params = await leerParametros();
  return withTx(async (client) => {
    const modo = await bloquearSerie(client);
    if (opciones.modoEsperado && opciones.modoEsperado !== (modo.prueba ? "prueba" : "eleccion")) {
      return { ok: false, status: 409, mensaje: "El modo cambió. Actualice la ficha antes de imprimir." };
    }
    return emitirActa(client, s, mjrvId, params, modo, opciones);
  });
}

export const MAX_RECIBOS_LOTE = CUPO_RECIBOS;
type ResultadoLoteRecibos = { ok: true; pdf: Uint8Array; numeros: string[] } | { ok: false; status: 400 | 404 | 409; mensaje: string };
class EmisionRechazada extends Error {
  constructor(readonly resultado: Extract<ResultadoActa, { ok: false }>) {
    super(resultado.mensaje);
  }
}

export async function generarRecibosContingencia(actor: ActorPago, seleccion: number[], modoEsperado?: Modo): Promise<ResultadoLoteRecibos> {
  const ids = [...new Set(seleccion)].sort((a, b) => a - b);
  if (!ids.length || ids.length > MAX_RECIBOS_LOTE || ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    return { ok: false, status: 400, mensaje: `Seleccione entre 1 y ${MAX_RECIBOS_LOTE} fichas válidas.` };
  }
  const params = await leerParametros();
  try {
    return await withTx(async (client) => {
      const modo = await bloquearSerie(client);
      if (modoEsperado && modoEsperado !== (modo.prueba ? "prueba" : "eleccion")) {
        return { ok: false, status: 409, mensaje: "El modo cambió. Actualice la lista antes de imprimir." };
      }
      const numeros: string[] = [];
      const lote = await PDFDocument.create();
      for (const id of ids) {
        const recibo = await emitirActa(client, actor, id, params, modo, { contingencia: true });
        if (!recibo.ok) throw new EmisionRechazada(recibo);
        numeros.push(recibo.numero);
        if (ids.length === 1) return { ok: true, pdf: recibo.pdf, numeros };
        const pdf = await PDFDocument.load(recibo.pdf);
        for (const pagina of await lote.copyPages(pdf, pdf.getPageIndices())) lote.addPage(pagina);
      }
      return { ok: true, pdf: await lote.save(), numeros };
    });
  } catch (e) {
    if (e instanceof EmisionRechazada) return e.resultado;
    throw e;
  }
}

export type ResultadoPago =
  | { ok: true; confirmadoEn: string; simulado: boolean; importeUsd: string; importeEur: string | null }
  | { ok: false; yaPagado?: { en: string; operador: string; importeUsd: string; importeEur: string | null }; mensaje: string };

// Confirmación atómica (01 §5): bloqueo de la ficha + índice único (mjrv_id, es_prueba). Dos puestos a la vez: solo uno inserta.
const SQL_PAGO_PREVIO = `SELECT p.confirmado_en::text AS en, ${SQL_QUIEN} AS operador, p.importe_usd::text, p.importe_eur::text FROM pagos_confirmados p ${JOIN_QUIEN} WHERE p.mjrv_id = $1`;

export async function confirmarPago(s: SesionEstacion | ActorPago, d: { mjrvId: number; actaId: number; verificado: boolean }): Promise<ResultadoPago> {
  if (!d.verificado) return { ok: false, mensaje: "Marque «He verificado que cumplió sus funciones»." };
  if (!Number.isSafeInteger(d.mjrvId) || d.mjrvId < 1 || !Number.isSafeInteger(d.actaId) || d.actaId < 1) {
    return { ok: false, mensaje: "Elija una ficha con un recibo emitido." };
  }
  const quien = puestoDe(s);
  return withTx(async (client) => {
    await contextoEmision(client);
    const [m] = (await client.query("SELECT 1 FROM mjrv WHERE id = $1 AND activo FOR UPDATE", [d.mjrvId])).rows;
    if (!m) return { ok: false as const, mensaje: "La ficha no existe o está de baja." };
    const previo = (await client.query<{ en: string; operador: string; importe_usd: string | null; importe_eur: string | null }>(SQL_PAGO_PREVIO, [d.mjrvId])).rows[0];
    if (previo) return { ok: false as const, yaPagado: { en: previo.en, operador: previo.operador, importeUsd: previo.importe_usd ?? "", importeEur: previo.importe_eur }, mensaje: "Ya pagado. No vuelva a pagar." };
    const [acta] = (await client.query(
      "SELECT 1 FROM actas_pago WHERE id = $1 AND mjrv_id = $2 AND recibo_principal AND importe_eur > 0", [d.actaId, d.mjrvId])).rows;
    if (!acta) return { ok: false as const, mensaje: "El acta no corresponde a esta persona o carece de importe en EUR. Genere el acta de nuevo." };
    await client.query("SELECT 1 FROM documentos_mjrv WHERE mjrv_id = $1 AND es_prueba = cne.en_prueba() FOR SHARE", [d.mjrvId]);
    if (!(await estadoDocumentos(d.mjrvId, client)).completos) {
      return { ok: false as const, mensaje: "Faltan fotos del documento de identidad." };
    }
    const [validada] = (await client.query("SELECT 1 FROM v_cedulas_validadas WHERE mjrv_id = $1", [d.mjrvId])).rows;
    if (!validada) return { ok: false as const, mensaje: "Falta validar el documento de identidad en el modo actual." };
    if ((await client.query(SQL_IDENTIDAD_PENDIENTE, [d.actaId])).rowCount) {
      return { ok: false as const, mensaje: "Reimprima el recibo con el documento vigente antes de confirmar el pago." };
    }
    const r = await client.query<{ id: number; confirmado_en: string; es_prueba: boolean; importe_usd: string | null; importe_eur: string | null }>(
      `INSERT INTO pagos_confirmados (mjrv_id, acta_id, importe_usd, tipo_cambio, importe_eur, funciones_verificadas, operador_id, enlace_id, usuario_id)
       SELECT $1, a.id, a.importe_usd, a.tipo_cambio, a.importe_eur, true, $3, $4, $5 FROM actas_pago a WHERE a.id = $2 AND a.mjrv_id = $1 AND a.importe_eur > 0 AND a.recibo_principal
       ON CONFLICT (mjrv_id, es_prueba) DO NOTHING RETURNING id, confirmado_en::text, es_prueba, importe_usd::text, importe_eur::text`,
      [d.mjrvId, d.actaId, quien.operadorId, quien.enlaceId, quien.usuarioId]);
    if (!r.rows[0]) {
      const previo = (await client.query<{ en: string; operador: string; importe_usd: string | null; importe_eur: string | null }>(SQL_PAGO_PREVIO, [d.mjrvId])).rows[0];
      if (previo) return { ok: false as const, yaPagado: { en: previo.en, operador: previo.operador, importeUsd: previo.importe_usd ?? "", importeEur: previo.importe_eur }, mensaje: "Ya pagado. No vuelva a pagar." };
      return { ok: false as const, mensaje: "El acta no corresponde a esta persona o carece de importe en EUR. Genere el acta de nuevo." };
    }
    await registrarAuditoria({ portal: "finanzas", actorTipo: quien.usuarioId ? "usuario" : "operador", actorId: quien.usuarioId ?? quien.operadorId, actorNombre: quien.nombre, accion: "pago_confirmado", entidad: "pagos_confirmados", entidadId: r.rows[0].id, datos: { mjrv: d.mjrvId, simulado: r.rows[0].es_prueba } }, client);
    return { ok: true as const, confirmadoEn: r.rows[0].confirmado_en, simulado: r.rows[0].es_prueba, importeUsd: r.rows[0].importe_usd ?? "", importeEur: r.rows[0].importe_eur };
  });
}
