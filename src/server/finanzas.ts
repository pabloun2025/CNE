import { PDFDocument } from "pdf-lib";
import type { PoolClient } from "pg";
import { faltanParametros, montosParaActa, type ParametrosPago } from "../domain/pago";
import { registrarAuditoria } from "./auditoria";
import { leerDocumento } from "./documentos";
import { query, withTx } from "./db";
import type { SesionEstacion } from "./estaciones";
import { leerModo } from "./config";
import { leerParametros } from "./pago";
import { actaPago, type DatosActa } from "./pdf/acta";
import { decryptBuffer, encryptBuffer } from "./crypto";
import { numeroActa } from "../domain/recibos";

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
  anverso: boolean; reverso: boolean; documentosCompletos: boolean; cedulaValidada: boolean;
  parametrosCompletos: boolean; faltanParametros: string[]; importeUsd: string | null; importeEur: string | null;
  acta: { id: number; impresionN: number } | null;
  pago: { en: string; operador: string; importeUsd: string; importeEur: string | null; simulado: boolean } | null;
  estado: EstadoPago; modoPrueba: boolean;
  // Otros puestos con esta ficha abierta hace menos de 5 minutos. Mientras haya uno, no se genera ni se confirma.
  otrosPuestos: { etiqueta: string; operador: string; haceMin: number }[];
};

const cedulaNorm = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "").slice(0, 20);

type Puesto = { enlaceId: number | null; usuarioId: number | null };

// Quien abrió la ficha antes puede seguir. Quien llegó después no genera ni confirma mientras esa apertura siga vigente.
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

async function anotarApertura(mjrvId: number, p: Puesto & { nombre: string }) {
  if (p.enlaceId != null) {
    await query(
      `INSERT INTO fichas_abiertas_finanzas (mjrv_id, enlace_id, operador_nombre) VALUES ($1, $2, $3)
       ON CONFLICT (mjrv_id, enlace_id, es_prueba) DO UPDATE SET operador_nombre = EXCLUDED.operador_nombre, abierta_en = now()`,
      [mjrvId, p.enlaceId, p.nombre],
    );
    return;
  }
  const ya = await query(
    `UPDATE fichas_abiertas_finanzas SET operador_nombre = $3, abierta_en = now() WHERE mjrv_id = $1 AND usuario_id = $2 RETURNING mjrv_id`,
    [mjrvId, p.usuarioId, p.nombre],
  );
  if (!ya[0]) await query(`INSERT INTO fichas_abiertas_finanzas (mjrv_id, usuario_id, operador_nombre) VALUES ($1,$2,$3)`, [mjrvId, p.usuarioId, p.nombre]);
}

export const MINUTOS_AVISO = 5;

// Abrir la ficha queda anotado. Si otro puesto la tiene abierta, no se genera ni se confirma el pago.
export async function fichaPago(cedulaBruta: string, s?: SesionEstacion | ActorPago): Promise<FichaPago | null> {
  const m = (await query<{ id: number; cedula: string; apellidos: string; nombres: string; cargo_original: string; activo: boolean; origen: string; vigente: string; cedula_validada_en: string | null }>(
    `SELECT m.id, m.cedula, m.apellidos, m.nombres, m.cargo_original, m.activo, m.cedula_validada_en::text, jo.serie || jo.numero AS origen,
            jv.serie || jv.numero AS vigente
       FROM mjrv m JOIN juntas_madrid jo ON jo.id = m.junta_origen_id
       JOIN juntas_madrid jv ON jv.id = coalesce((SELECT d.junta_destino_id FROM decisiones_movimiento d WHERE d.mjrv_id = m.id AND d.decision = 'aceptada' ORDER BY d.creado_en DESC, d.id DESC LIMIT 1), m.junta_origen_id)
      WHERE m.cedula = $1`, [cedulaNorm(cedulaBruta)]))[0];
  if (!m) return null;
  const lados = (await query<{ lado: string }>("SELECT lado FROM documentos_mjrv WHERE mjrv_id = $1", [m.id])).map((x) => x.lado);
  const params = await leerParametros();
  const imp = montosParaActa(params);
  const acta = (await query<{ id: number; impresion_n: number; importe_eur: string | null }>(
    "SELECT id, impresion_n, importe_eur::text FROM actas_pago WHERE mjrv_id = $1 AND recibo_principal", [m.id]))[0];
  const pago = (await query<{ en: string; operador: string; importe_usd: string | null; importe_eur: string | null; es_prueba: boolean }>(
    `SELECT p.confirmado_en::text AS en, ${SQL_QUIEN} AS operador, p.importe_usd::text, p.importe_eur::text, p.es_prueba FROM pagos_confirmados p ${JOIN_QUIEN} WHERE p.mjrv_id = $1`, [m.id]))[0];
  const documentosCompletos = lados.includes("anverso") && lados.includes("reverso");
  const estado: EstadoPago = pago ? "pagada" : !documentosCompletos ? "documentacion_incompleta" : acta ? "acta_preparada" : "lista";
  const faltan = faltanParametros(params);
  let otrosPuestos: FichaPago["otrosPuestos"] = [];
  if (s) {
    const p = puestoDe(s);
    await anotarApertura(m.id, p);
    otrosPuestos = (await query<{ etiqueta: string; operador: string; hace_min: number }>(
      `SELECT coalesce(e.etiqueta, 'Módulo de pago') AS etiqueta, f.operador_nombre AS operador,
              floor(extract(epoch FROM now() - f.abierta_en) / 60)::int AS hace_min
         FROM fichas_abiertas_finanzas f LEFT JOIN enlaces_estacion e ON e.id = f.enlace_id
        WHERE f.mjrv_id = $1 AND f.abierta_en > now() - make_interval(mins => $3)
          AND (CASE WHEN $2::bigint IS NOT NULL THEN f.enlace_id IS DISTINCT FROM $2 ELSE TRUE END)
          AND (CASE WHEN $4::bigint IS NOT NULL THEN f.usuario_id IS DISTINCT FROM $4 ELSE TRUE END)
        ORDER BY f.abierta_en DESC`, [m.id, p.enlaceId, MINUTOS_AVISO, p.usuarioId]))
      .map((x) => ({ etiqueta: x.etiqueta, operador: x.operador, haceMin: x.hace_min }));
  }
  return {
    mjrvId: m.id, cedula: m.cedula, apellidos: m.apellidos, nombres: m.nombres, nombre: `${m.apellidos}, ${m.nombres}`, cargo: m.cargo_original, juntaOrigen: m.origen, juntaVigente: m.vigente, activo: m.activo,
    anverso: lados.includes("anverso"), reverso: lados.includes("reverso"), documentosCompletos, cedulaValidada: m.cedula_validada_en != null,
    parametrosCompletos: faltan.length === 0, faltanParametros: faltan, importeUsd: null,
    importeEur: acta?.importe_eur ?? (imp.estado === "ok" ? imp.eur : null),
    acta: acta ? { id: acta.id, impresionN: acta.impresion_n } : null,
    pago: pago ? { en: pago.en, operador: pago.operador, importeUsd: pago.importe_usd ?? "", importeEur: pago.importe_eur, simulado: pago.es_prueba } : null,
    estado, modoPrueba: (await leerModo()) === "prueba", otrosPuestos,
  };
}

export type ResultadoActa = { ok: true; pdf: Uint8Array; borrador: boolean; numero: string; actaId: number | null } | { ok: false; status: 400 | 404 | 409; mensaje: string };

type DatosGuardados = ParametrosPago & { persona_recibo?: DatosActa["persona"]; contingencia?: boolean };
type ActaEmitida = {
  id: number; impresion_n: number; creado_en: Date; importe_eur: string | null; parametros: DatosGuardados;
  recibo_cifrado: Buffer | null; recibo_nonce: Buffer | null;
};
const CAMPOS_ACTA = "id, impresion_n, creado_en, importe_eur::text, parametros, recibo_cifrado, recibo_nonce";

async function contextoEmision(client: PoolClient) {
  // El modo permanece fijo durante la emisión, incluso cuando se genera un lote.
  return (await client.query<{ prueba: boolean; modo_recibo: string }>(
    "SELECT modo = 'prueba' AS prueba, modo_recibo FROM configuracion WHERE id = 1 FOR SHARE")).rows[0];
}

async function emitirActa(client: PoolClient, s: SesionEstacion | ActorPago, mjrvId: number, params: ParametrosPago,
  modo: Awaited<ReturnType<typeof contextoEmision>>, contingencia: boolean, firma?: Buffer): Promise<ResultadoActa> {
  if (firma && modo.modo_recibo !== "digital") return { ok: false, status: 409, mensaje: "El modo digital no está activado." };
  const quien = puestoDe(s);
  const [m] = (await client.query<{ cedula: string; apellidos: string; nombres: string; cargo_original: string; activo: boolean }>(
    "SELECT cedula, apellidos, nombres, cargo_original, activo FROM mjrv WHERE id = $1 FOR UPDATE", [mjrvId])).rows;
  if (!m) return { ok: false, status: 404, mensaje: "La ficha no existe." };

  const [existente] = (await client.query<ActaEmitida>(`SELECT ${CAMPOS_ACTA} FROM actas_pago WHERE mjrv_id = $1 AND recibo_principal`, [mjrvId])).rows;
  if (!m.activo && !(contingencia && existente)) return { ok: false, status: 404, mensaje: "La ficha está de baja." };
  const imp = montosParaActa(params);
  const importePendiente = existente && !existente.importe_eur && m.activo && imp.estado === "ok";
  const pagado = (!contingencia || importePendiente) &&
    Boolean((await client.query("SELECT 1 FROM pagos_confirmados WHERE mjrv_id = $1", [mjrvId])).rows[0]);
  const completarImporte = importePendiente && !pagado;
  if (!contingencia) {
    if (pagado) return { ok: false, status: 409, mensaje: "Esta persona ya tiene el pago confirmado. Busque su recibo para reimprimirlo." };
    if (await otroPagoEnCurso(client, mjrvId, quien)) return { ok: false, status: 409, mensaje: "Otra persona está haciendo este pago. No se puede continuar." };
  }

  let anexo: DatosActa["anexo"];
  if (!contingencia) {
    const anverso = await leerDocumento(mjrvId, "anverso", client);
    const reverso = await leerDocumento(mjrvId, "reverso", client);
    if (!anverso || !reverso) return { ok: false, status: 409, mensaje: "Faltan fotos de la cédula: no se puede generar el acta." };
    anexo = { anverso, reverso };
  }

  if (!existente && imp.estado !== "ok" && (contingencia || firma)) {
    return { ok: false, status: 409, mensaje: `Configure ${imp.faltan.join(" y ")} antes de emitir recibos.` };
  }
  if (firma && existente && !existente.importe_eur && !completarImporte) return { ok: false, status: 409, mensaje: "El recibo histórico carece de importe en EUR." };

  if (existente) {
    const numero = numeroActa(existente.id, modo.prueba);
    await client.query("UPDATE actas_pago SET impresion_n = impresion_n + 1 WHERE id = $1", [existente.id]);
    await registrarAuditoria({ portal: "finanzas", actorTipo: quien.usuarioId ? "usuario" : "operador", actorId: quien.usuarioId ?? quien.operadorId,
      actorNombre: quien.nombre, accion: "acta_reimpresa", entidad: "actas_pago", entidadId: existente.id, datos: { contingencia } }, client);
    if (contingencia && !completarImporte && existente.recibo_cifrado && existente.recibo_nonce) {
      return { ok: true, pdf: decryptBuffer(existente.recibo_cifrado, existente.recibo_nonce), borrador: false, numero, actaId: existente.id };
    }
    if (!contingencia && !completarImporte) {
      const [firmado] = (await client.query<{ pdf: Buffer }>("SELECT pdf FROM firmas_recibo WHERE acta_id = $1", [existente.id])).rows;
      if (firmado) return { ok: true, pdf: firmado.pdf, borrador: false, numero, actaId: existente.id };
    }
  }

  const [j] = (await client.query<{ vigente: string }>(
    `SELECT jv.serie || jv.numero AS vigente FROM mjrv m JOIN juntas_madrid jv ON jv.id = coalesce((
       SELECT d.junta_destino_id FROM decisiones_movimiento d
        WHERE d.mjrv_id = m.id AND d.decision = 'aceptada' AND ($2::timestamptz IS NULL OR d.creado_en <= $2)
        ORDER BY d.creado_en DESC, d.id DESC LIMIT 1), m.junta_origen_id) WHERE m.id = $1`, [mjrvId, existente?.creado_en ?? null])).rows;
  const persona = { apellidos: m.apellidos, nombres: m.nombres, cedula: m.cedula, cargo: m.cargo_original, juntaVigente: j.vigente };
  const guardados = completarImporte ? { ...params, persona_recibo: existente.parametros.persona_recibo ?? persona, contingencia }
    : existente?.parametros ?? { ...params, persona_recibo: persona, contingencia };
  let acta = existente;
  if (!acta && imp.estado === "ok") {
    [acta] = (await client.query<ActaEmitida>(
      `INSERT INTO actas_pago (mjrv_id, operador_id, usuario_id, importe_eur, parametros, impresion_n)
       VALUES ($1,$2,$3,$4,$5::jsonb,1) RETURNING ${CAMPOS_ACTA}`,
      [mjrvId, quien.operadorId, quien.usuarioId, imp.eur, JSON.stringify(guardados)])).rows;
    await registrarAuditoria({ portal: "finanzas", actorTipo: quien.usuarioId ? "usuario" : "operador", actorId: quien.usuarioId ?? quien.operadorId,
      actorNombre: quien.nombre, accion: "acta_generada", entidad: "actas_pago", entidadId: acta.id, datos: { mjrv: mjrvId, contingencia } }, client);
  }
  if (completarImporte && imp.estado === "ok") {
    [acta] = (await client.query<ActaEmitida>(
      `UPDATE actas_pago SET importe_eur = $2, parametros = $3::jsonb WHERE id = $1 RETURNING ${CAMPOS_ACTA}`,
      [existente.id, imp.eur, JSON.stringify(guardados)])).rows;
    await registrarAuditoria({ portal: "finanzas", actorTipo: quien.usuarioId ? "usuario" : "operador", actorId: quien.usuarioId ?? quien.operadorId,
      actorNombre: quien.nombre, accion: "acta_importe_completado", entidad: "actas_pago", entidadId: existente.id, datos: { mjrv: mjrvId, contingencia } }, client);
  }
  const numero = numeroActa(acta?.id ?? null, modo.prueba);
  const importe = acta?.importe_eur;
  const datos: DatosActa = {
    numero, impresionN: existente ? existente.impresion_n + 1 : 1, prueba: modo.prueba, borrador: !importe,
    emitidaEn: acta?.creado_en ?? new Date(), persona: guardados.persona_recibo ?? persona,
    importe: importe ? { eur: importe } : null,
    pagador: guardados.pagador_nombre ? { nombre: guardados.pagador_nombre, cargo: guardados.pagador_cargo ?? "" } : null,
    firmaReceptor: firma, contingencia: guardados.contingencia, reconstruido: !!existente && !guardados.persona_recibo,
  };
  const pdf = await actaPago({ ...datos, anexo });
  if (acta && (!existente || completarImporte || firma)) {
    const recibo = anexo ? await actaPago({ ...datos, impresionN: 1 }) : pdf;
    const { ciphertext, nonce } = encryptBuffer(Buffer.from(recibo));
    await client.query("UPDATE actas_pago SET recibo_cifrado = $2, recibo_nonce = $3 WHERE id = $1", [acta.id, ciphertext, nonce]);
  }
  if (acta && firma) {
    await client.query("INSERT INTO firmas_recibo (mjrv_id, usuario_id, pdf, acta_id, es_prueba) VALUES ($1,$2,$3,$4,$5)",
      [mjrvId, quien.usuarioId, Buffer.from(pdf), acta.id, modo.prueba]);
  }
  return { ok: true, pdf, borrador: !importe, numero, actaId: acta?.id ?? null };
}

export async function generarActa(s: SesionEstacion | ActorPago, mjrvId: number, verificado: boolean, firma?: Buffer): Promise<ResultadoActa> {
  if (!verificado) return { ok: false, status: 400, mensaje: "Marque «He verificado que cumplió sus funciones»." };
  const params = await leerParametros();
  return withTx(async (client) => emitirActa(client, s, mjrvId, params, await contextoEmision(client), false, firma));
}

export const MAX_RECIBOS_LOTE = 100;
type ResultadoLoteRecibos = { ok: true; pdf: Uint8Array; numeros: string[] } | { ok: false; status: 400 | 404 | 409; mensaje: string };
class EmisionRechazada extends Error {
  constructor(readonly resultado: Extract<ResultadoActa, { ok: false }>) {
    super(resultado.mensaje);
  }
}

export async function generarRecibosContingencia(actor: ActorPago, seleccion: number[]): Promise<ResultadoLoteRecibos> {
  const ids = [...new Set(seleccion)].sort((a, b) => a - b);
  if (!ids.length || ids.length > MAX_RECIBOS_LOTE || ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    return { ok: false, status: 400, mensaje: `Seleccione entre 1 y ${MAX_RECIBOS_LOTE} fichas válidas.` };
  }
  const params = await leerParametros();
  try {
    return await withTx(async (client) => {
      const modo = await contextoEmision(client);
      const numeros: string[] = [];
      const lote = await PDFDocument.create();
      for (const id of ids) {
        const recibo = await emitirActa(client, actor, id, params, modo, true);
        if (!recibo.ok) throw new EmisionRechazada(recibo);
        numeros.push(recibo.numero);
        if (ids.length === 1) return { ok: true, pdf: recibo.pdf, numeros };
        const pdf = await PDFDocument.load(recibo.pdf);
        const [pagina] = await lote.copyPages(pdf, [0]);
        lote.addPage(pagina);
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
  const quien = puestoDe(s);
  const params = await leerParametros();
  if (faltanParametros(params).length) return { ok: false, mensaje: "Los parámetros de pago están incompletos: no se puede confirmar." };
  return withTx(async (client) => {
    const m = (await client.query("SELECT 1 FROM mjrv WHERE id = $1 AND activo FOR UPDATE", [d.mjrvId])).rows[0];
    if (!m) return { ok: false as const, mensaje: "La ficha no existe o está de baja." };
    const previo = (await client.query<{ en: string; operador: string; importe_usd: string | null; importe_eur: string | null }>(SQL_PAGO_PREVIO, [d.mjrvId])).rows[0];
    if (previo) return { ok: false as const, yaPagado: { en: previo.en, operador: previo.operador, importeUsd: previo.importe_usd ?? "", importeEur: previo.importe_eur }, mensaje: "Ya pagado. No vuelva a pagar." };
    if (await otroPagoEnCurso(client, d.mjrvId, quien)) return { ok: false as const, mensaje: "Otra persona está haciendo este pago. No se puede continuar." };
    const docs = (await client.query<{ n: number }>("SELECT count(DISTINCT lado)::int AS n FROM documentos_mjrv WHERE mjrv_id = $1", [d.mjrvId])).rows[0].n;
    if (docs < 2) return { ok: false as const, mensaje: "Faltan fotos de la cédula." };
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
