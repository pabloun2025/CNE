import { faltanParametros, montosParaActa } from "../domain/pago";
import { registrarAuditoria } from "./auditoria";
import { leerDocumento } from "./documentos";
import { query, withTx } from "./db";
import type { SesionEstacion } from "./estaciones";
import { leerModo } from "./config";
import { leerParametros } from "./pago";
import { actaPago } from "./pdf/acta";

export type EstadoPago = "documentacion_incompleta" | "lista" | "acta_preparada" | "pagada";

export type FichaPago = {
  mjrvId: number; cedula: string; nombre: string; cargo: string; juntaOrigen: string; juntaVigente: string; activo: boolean;
  anverso: boolean; reverso: boolean; documentosCompletos: boolean;
  parametrosCompletos: boolean; faltanParametros: string[]; importeUsd: string | null; importeEur: string | null;
  acta: { id: number; impresionN: number } | null;
  pago: { en: string; operador: string; importeUsd: string; importeEur: string | null; simulado: boolean } | null;
  estado: EstadoPago; modoPrueba: boolean;
  // Otros puestos con esta ficha abierta hace menos de 5 minutos. Mientras haya uno, no se genera ni se confirma.
  otrosPuestos: { etiqueta: string; operador: string; haceMin: number }[];
};

const cedulaNorm = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "").slice(0, 20);

// Quien abrió la ficha antes puede seguir. Quien llegó después no genera ni confirma mientras esa apertura siga vigente.
async function otroPagoEnCurso(client: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }, mjrvId: number, enlaceId: number): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM fichas_abiertas_finanzas o
      WHERE o.mjrv_id = $1 AND o.enlace_id <> $2
        AND o.abierta_en > now() - make_interval(mins => $3)
        AND o.abierta_en < COALESCE((SELECT y.abierta_en FROM fichas_abiertas_finanzas y WHERE y.mjrv_id = $1 AND y.enlace_id = $2), now())`,
    [mjrvId, enlaceId, MINUTOS_AVISO],
  );
  return r.rows.length > 0;
}

export const MINUTOS_AVISO = 5;

// Abrir la ficha queda anotado. Si otro puesto la tiene abierta, no se genera ni se confirma el pago.
export async function fichaPago(cedulaBruta: string, s?: SesionEstacion): Promise<FichaPago | null> {
  const m = (await query<{ id: number; cedula: string; apellidos: string; nombres: string; cargo_original: string; activo: boolean; origen: string; vigente: string }>(
    `SELECT m.id, m.cedula, m.apellidos, m.nombres, m.cargo_original, m.activo, jo.serie || jo.numero AS origen,
            jv.serie || jv.numero AS vigente
       FROM mjrv m JOIN juntas_madrid jo ON jo.id = m.junta_origen_id
       JOIN juntas_madrid jv ON jv.id = coalesce((SELECT d.junta_destino_id FROM decisiones_movimiento d WHERE d.mjrv_id = m.id AND d.decision = 'aceptada' ORDER BY d.creado_en DESC, d.id DESC LIMIT 1), m.junta_origen_id)
      WHERE m.cedula = $1`, [cedulaNorm(cedulaBruta)]))[0];
  if (!m) return null;
  const lados = (await query<{ lado: string }>("SELECT lado FROM documentos_mjrv WHERE mjrv_id = $1", [m.id])).map((x) => x.lado);
  const params = await leerParametros();
  const imp = montosParaActa(params);
  const acta = (await query<{ id: number; impresion_n: number }>("SELECT id, impresion_n FROM actas_pago WHERE mjrv_id = $1 ORDER BY id DESC LIMIT 1", [m.id]))[0];
  const pago = (await query<{ en: string; operador: string; importe_usd: string | null; importe_eur: string | null; es_prueba: boolean }>(
    "SELECT p.confirmado_en::text AS en, btrim(o.nombre || ' ' || o.apellido) AS operador, p.importe_usd::text, p.importe_eur::text, p.es_prueba FROM pagos_confirmados p JOIN operadores_madrid o ON o.id = p.operador_id WHERE p.mjrv_id = $1", [m.id]))[0];
  const documentosCompletos = lados.includes("anverso") && lados.includes("reverso");
  const estado: EstadoPago = pago ? "pagada" : !documentosCompletos ? "documentacion_incompleta" : acta ? "acta_preparada" : "lista";
  const faltan = faltanParametros(params);
  let otrosPuestos: FichaPago["otrosPuestos"] = [];
  if (s) {
    await query(
      `INSERT INTO fichas_abiertas_finanzas (mjrv_id, enlace_id, operador_nombre) VALUES ($1, $2, $3)
       ON CONFLICT (mjrv_id, enlace_id, es_prueba) DO UPDATE SET operador_nombre = EXCLUDED.operador_nombre, abierta_en = now()`, [m.id, s.enlaceId, s.operadorNombre]);
    otrosPuestos = (await query<{ etiqueta: string; operador: string; hace_min: number }>(
      `SELECT e.etiqueta, f.operador_nombre AS operador, floor(extract(epoch FROM now() - f.abierta_en) / 60)::int AS hace_min
         FROM fichas_abiertas_finanzas f JOIN enlaces_estacion e ON e.id = f.enlace_id
        WHERE f.mjrv_id = $1 AND f.enlace_id <> $2 AND f.abierta_en > now() - make_interval(mins => $3) ORDER BY f.abierta_en DESC`, [m.id, s.enlaceId, MINUTOS_AVISO]))
      .map((x) => ({ etiqueta: x.etiqueta, operador: x.operador, haceMin: x.hace_min }));
  }
  return {
    mjrvId: m.id, cedula: m.cedula, nombre: `${m.apellidos}, ${m.nombres}`, cargo: m.cargo_original, juntaOrigen: m.origen, juntaVigente: m.vigente, activo: m.activo,
    anverso: lados.includes("anverso"), reverso: lados.includes("reverso"), documentosCompletos,
    parametrosCompletos: faltan.length === 0, faltanParametros: faltan, importeUsd: imp.estado === "ok" ? imp.usd : null, importeEur: imp.estado === "ok" ? imp.eur : null,
    acta: acta ? { id: acta.id, impresionN: acta.impresion_n } : null,
    pago: pago ? { en: pago.en, operador: pago.operador, importeUsd: pago.importe_usd ?? "", importeEur: pago.importe_eur, simulado: pago.es_prueba } : null,
    estado, modoPrueba: (await leerModo()) === "prueba", otrosPuestos,
  };
}

export type ResultadoActa = { ok: true; pdf: Uint8Array; borrador: boolean; numero: string } | { ok: false; status: 400 | 404 | 409; mensaje: string };

// Generar o reimprimir el acta. Registra actas_pago (impresion_n) salvo en borrador. NO registra el pago.
export async function generarActa(s: SesionEstacion, mjrvId: number, verificado: boolean): Promise<ResultadoActa> {
  if (!verificado) return { ok: false, status: 400, mensaje: "Marque «He verificado que cumplió sus funciones»." };
  const params = await leerParametros();
  const imp = montosParaActa(params);
  const completos = faltanParametros(params).length === 0 && imp.estado === "ok";
  const prueba = (await leerModo()) === "prueba";
  const datos = await withTx(async (client) => {
    const m = (await client.query<{ id: number; cedula: string; apellidos: string; nombres: string; cargo_original: string; activo: boolean }>("SELECT id, cedula, apellidos, nombres, cargo_original, activo FROM mjrv WHERE id = $1 FOR UPDATE", [mjrvId])).rows[0];
    if (!m || !m.activo) return { error: { status: 404 as const, mensaje: "La ficha no existe o está de baja." } };
    if ((await client.query("SELECT 1 FROM pagos_confirmados WHERE mjrv_id = $1", [mjrvId])).rows[0]) return { error: { status: 409 as const, mensaje: "Esta persona ya tiene el pago confirmado." } };
    if (await otroPagoEnCurso(client, mjrvId, s.enlaceId)) return { error: { status: 409 as const, mensaje: "Otra persona está haciendo este pago. No se puede continuar." } };
    const lados = (await client.query<{ lado: string }>("SELECT lado FROM documentos_mjrv WHERE mjrv_id = $1", [mjrvId])).rows.map((r) => r.lado);
    if (lados.length < 2) return { error: { status: 409 as const, mensaje: "Faltan fotos de la cédula: no se puede generar el acta." } };
    const j = (await client.query<{ vigente: string }>(
      `SELECT jv.serie || jv.numero AS vigente FROM mjrv m
         JOIN juntas_madrid jv ON jv.id = coalesce((SELECT d.junta_destino_id FROM decisiones_movimiento d WHERE d.mjrv_id = m.id AND d.decision = 'aceptada' ORDER BY d.creado_en DESC, d.id DESC LIMIT 1), m.junta_origen_id) WHERE m.id = $1`, [mjrvId])).rows[0];
    let actaId = 0, impresionN = 1;
    if (completos && imp.estado === "ok") {
      impresionN = (await client.query<{ n: number }>("SELECT count(*)::int + 1 AS n FROM actas_pago WHERE mjrv_id = $1", [mjrvId])).rows[0].n;
      actaId = (await client.query<{ id: number }>(
        "INSERT INTO actas_pago (mjrv_id, operador_id, importe_usd, tipo_cambio, importe_eur, parametros, impresion_n) VALUES ($1,$2,$3,NULL,$4,$5::jsonb,$6) RETURNING id",
        [mjrvId, s.operadorId, imp.usd, imp.eur, JSON.stringify(params), impresionN])).rows[0].id;
      await registrarAuditoria({ portal: "finanzas", actorTipo: "operador", actorId: s.operadorId, actorNombre: s.operadorNombre, accion: "acta_generada", entidad: "actas_pago", entidadId: actaId, datos: { mjrv: mjrvId, impresion: impresionN } }, client);
    }
    return { m, j, actaId, impresionN };
  });
  if ("error" in datos && datos.error) return { ok: false, ...datos.error };
  const { m, j, actaId, impresionN } = datos as { m: { cedula: string; apellidos: string; nombres: string; cargo_original: string }; j: { vigente: string }; actaId: number; impresionN: number };
  const [anverso, reverso] = [await leerDocumento(mjrvId, "anverso"), await leerDocumento(mjrvId, "reverso")];
  if (!anverso || !reverso) return { ok: false, status: 409, mensaje: "Faltan fotos de la cédula: no se puede generar el acta." };
  const numero = completos ? `${prueba ? "PRUEBA" : "MAD"}-${String(actaId).padStart(6, "0")}` : `${prueba ? "PRUEBA" : "MAD"}-BORRADOR`;
  const pdf = await actaPago({
    numero, impresionN, prueba, borrador: !completos, emitidaEn: new Date(),
    persona: { apellidos: m.apellidos, nombres: m.nombres, cedula: m.cedula, cargo: m.cargo_original, juntaVigente: j.vigente },
    importe: completos && imp.estado === "ok" ? { usd: imp.usd, eur: imp.eur } : null,
    pagador: params.pagador_nombre ? { nombre: params.pagador_nombre, cargo: params.pagador_cargo ?? "" } : null,
    anverso, reverso,
  });
  return { ok: true, pdf, borrador: !completos, numero };
}

export type ResultadoPago =
  | { ok: true; confirmadoEn: string; simulado: boolean; importeUsd: string; importeEur: string | null }
  | { ok: false; yaPagado?: { en: string; operador: string; importeUsd: string; importeEur: string | null }; mensaje: string };

// Confirmación atómica (01 §5): bloqueo de la ficha + índice único (mjrv_id, es_prueba). Dos puestos a la vez: solo uno inserta.
export async function confirmarPago(s: SesionEstacion, d: { mjrvId: number; actaId: number; verificado: boolean }): Promise<ResultadoPago> {
  if (!d.verificado) return { ok: false, mensaje: "Marque «He verificado que cumplió sus funciones»." };
  const params = await leerParametros();
  if (faltanParametros(params).length) return { ok: false, mensaje: "Los parámetros de pago están incompletos: no se puede confirmar." };
  return withTx(async (client) => {
    const m = (await client.query("SELECT 1 FROM mjrv WHERE id = $1 AND activo FOR UPDATE", [d.mjrvId])).rows[0];
    if (!m) return { ok: false as const, mensaje: "La ficha no existe o está de baja." };
    const previo = (await client.query<{ en: string; operador: string; importe_usd: string | null; importe_eur: string | null }>("SELECT p.confirmado_en::text AS en, btrim(o.nombre || ' ' || o.apellido) AS operador, p.importe_usd::text, p.importe_eur::text FROM pagos_confirmados p JOIN operadores_madrid o ON o.id = p.operador_id WHERE p.mjrv_id = $1", [d.mjrvId])).rows[0];
    if (previo) return { ok: false as const, yaPagado: { en: previo.en, operador: previo.operador, importeUsd: previo.importe_usd ?? "", importeEur: previo.importe_eur }, mensaje: "Ya pagado. No vuelva a pagar." };
    if (await otroPagoEnCurso(client, d.mjrvId, s.enlaceId)) return { ok: false as const, mensaje: "Otra persona está haciendo este pago. No se puede continuar." };
    const docs = (await client.query<{ n: number }>("SELECT count(DISTINCT lado)::int AS n FROM documentos_mjrv WHERE mjrv_id = $1", [d.mjrvId])).rows[0].n;
    if (docs < 2) return { ok: false as const, mensaje: "Faltan fotos de la cédula." };
    const r = await client.query<{ id: number; confirmado_en: string; es_prueba: boolean; importe_usd: string | null; importe_eur: string | null }>(
      `INSERT INTO pagos_confirmados (mjrv_id, acta_id, importe_usd, tipo_cambio, importe_eur, funciones_verificadas, operador_id, enlace_id)
       SELECT $1, a.id, a.importe_usd, a.tipo_cambio, a.importe_eur, true, $3, $4 FROM actas_pago a WHERE a.id = $2 AND a.mjrv_id = $1
       ON CONFLICT (mjrv_id, es_prueba) DO NOTHING RETURNING id, confirmado_en::text, es_prueba, importe_usd::text, importe_eur::text`,
      [d.mjrvId, d.actaId, s.operadorId, s.enlaceId]);
    if (!r.rows[0]) {
      const previo = (await client.query<{ en: string; operador: string; importe_usd: string | null; importe_eur: string | null }>("SELECT p.confirmado_en::text AS en, btrim(o.nombre || ' ' || o.apellido) AS operador, p.importe_usd::text, p.importe_eur::text FROM pagos_confirmados p JOIN operadores_madrid o ON o.id = p.operador_id WHERE p.mjrv_id = $1", [d.mjrvId])).rows[0];
      if (previo) return { ok: false as const, yaPagado: { en: previo.en, operador: previo.operador, importeUsd: previo.importe_usd ?? "", importeEur: previo.importe_eur }, mensaje: "Ya pagado. No vuelva a pagar." };
      return { ok: false as const, mensaje: "El acta indicada no corresponde a esta persona. Genere el acta de nuevo." };
    }
    await registrarAuditoria({ portal: "finanzas", actorTipo: "operador", actorId: s.operadorId, actorNombre: s.operadorNombre, accion: "pago_confirmado", entidad: "pagos_confirmados", entidadId: r.rows[0].id, datos: { mjrv: d.mjrvId, simulado: r.rows[0].es_prueba } }, client);
    return { ok: true as const, confirmadoEn: r.rows[0].confirmado_en, simulado: r.rows[0].es_prueba, importeUsd: r.rows[0].importe_usd ?? "", importeEur: r.rows[0].importe_eur };
  });
}
