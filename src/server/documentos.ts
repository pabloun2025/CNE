import sharp from "sharp";
import type { PoolClient } from "pg";
import { sha256Bytes, sha256Hex } from "../domain/text";
import type { EstadoDocs, EstadoSeguimientoDocumento, LadoDocumento, OrigenFotosDocumento } from "../domain/documentos";
import { decryptBuffer, encryptBuffer } from "./crypto";
import { normalizarFrase } from "../domain/limpieza";
import type { Sesion } from "./auth";
import type { Modo } from "./config";
import { registrarAuditoria } from "./auditoria";
import { query, withOwnerTx, withTx } from "./db";
import { juntaPublicaSql } from "./junta-sql";

export type Lado = LadoDocumento;
export type { EstadoDocs } from "../domain/documentos";
export const MIN_BYTES = 20_000;
export const MAX_BYTES = 2_000_000;
const MAX_LADO_PX = 1200;

export type Busqueda = { mjrvId: number; iniciales: string; junta: string } & EstadoDocs;
export type BusquedaCompleta = Busqueda & { nombre: string; cedula: string };

const normalizarCedula = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "");
const iniciales = (nombres: string, apellidos: string) => `${nombres.trim()[0] ?? "?"}. ${apellidos.trim()[0] ?? "?"}.`;

function estadoDeLados(lados: Lado[]): EstadoDocs {
  const anverso = lados.includes("anverso");
  const reverso = lados.includes("reverso");
  const pasaporte = lados.includes("pasaporte");
  return { anverso, reverso, completos: pasaporte || (anverso && reverso), ...(pasaporte ? { pasaporte: true } : {}) };
}

export async function estadoDocumentos(mjrvId: number, client?: PoolClient): Promise<EstadoDocs> {
  const sql = "SELECT lado FROM documentos_mjrv WHERE mjrv_id = $1 AND es_prueba = cne.en_prueba()";
  const params = [mjrvId];
  const filas = client ? (await client.query<{ lado: Lado }>(sql, params)).rows : await query<{ lado: Lado }>(sql, params);
  return estadoDeLados(filas.map((f) => f.lado));
}

export type FichaDocumentosFinanzas = {
  id: number; nombre: string; cedula: string; junta: string; juntaActualId: number;
  estado: EstadoSeguimientoDocumento; origen: OrigenFotosDocumento | null; version: string;
  revisionEn: string | null; motivoRepetir: string | null;
} & EstadoDocs;

type FotoVersion = { lado: Lado; capturado: string; hash: string };
const huellaFotos = (fotos: FotoVersion[]) => sha256Hex(JSON.stringify(fotos));

export async function consultarSeguimientoDocumental(client: PoolClient, juntaVigente?: number): Promise<FichaDocumentosFinanzas[]> {
  type Fila = Omit<FichaDocumentosFinanzas, keyof EstadoDocs | "estado" | "origen" | "version"> & {
    fotos: FotoVersion[]; validada: boolean; necesitaRepetir: boolean; publico: boolean | null; personal: boolean | null;
  };
  const { rows } = await client.query<Fila>(
    `SELECT m.id, m.apellidos || ', ' || m.nombres AS nombre, m.cedula, ${juntaPublicaSql("j")} AS junta, a.junta_actual_id AS "juntaActualId",
            coalesce(d.fotos, '[]'::json) AS fotos, v.mjrv_id IS NOT NULL AS validada, d.publico, d.personal,
            r.mjrv_id IS NOT NULL AS "necesitaRepetir", r.motivo_repetir AS "motivoRepetir",
            coalesce(r.repetir_en, v.validada_en)::text AS "revisionEn"
       FROM mjrv m JOIN juntas_madrid j ON j.id = m.junta_origen_id
       JOIN v_mjrv_asignacion a ON a.mjrv_id = m.id
       LEFT JOIN v_cedulas_validadas v ON v.mjrv_id = m.id
       LEFT JOIN v_documentos_por_repetir r ON r.mjrv_id = m.id
       CROSS JOIN LATERAL (
         SELECT json_agg(json_build_object('lado', f.lado, 'capturado', f.creado_en::text, 'hash', encode(f.sha256, 'hex')) ORDER BY f.lado) AS fotos,
                bool_or(f.origen = 'publico') AS publico,
                bool_or(f.origen = 'estacion') AS personal
           FROM documentos_mjrv f WHERE f.mjrv_id = m.id AND f.es_prueba = cne.en_prueba()
       ) d
      WHERE m.activo AND (cne.en_prueba() OR NOT m.es_prueba)
        AND ($1::bigint IS NULL OR a.junta_actual_id = $1)
      ORDER BY CASE WHEN $1::bigint IS NULL THEN j.serie END,
               CASE WHEN $1::bigint IS NULL THEN j.numero END, m.apellidos, m.nombres, m.id`, [juntaVigente ?? null],
  );
  return rows.map(({ fotos, validada, necesitaRepetir, publico, personal, ...ficha }) => {
    const detalles = estadoDeLados(fotos.map((f) => f.lado));
    const estado = necesitaRepetir ? "necesita_repetir" : detalles.completos ? (validada ? "validado" : "por_validar") : (fotos.length ? "incompleto" : "sin_documento");
    const origen = publico && personal ? "mixto" : publico ? "mjrv" : personal ? "personal" : null;
    return { ...ficha, ...detalles, estado, origen, version: huellaFotos(fotos) };
  });
}

export async function listarDocumentosFinanzas(): Promise<{ modo: Modo; fichas: FichaDocumentosFinanzas[] }> {
  return withTx(async (client) => {
    const { rows: [{ modo }] } = await client.query<{ modo: Modo }>("SELECT modo FROM configuracion WHERE id = 1 FOR SHARE");
    return { modo, fichas: await consultarSeguimientoDocumental(client) };
  });
}

// La búsqueda usa el número del padrón. El formulario público solo recibe iniciales y junta; la estación ve el nombre completo.
export async function buscarPorCedula(cedulaBruta: string, client?: PoolClient): Promise<BusquedaCompleta | null> {
  const cedula = normalizarCedula(cedulaBruta).slice(0, 20);
  type Fila = { id: number; cedula: string; apellidos: string; nombres: string; junta: string };
  const sql = "SELECT m.id, m.cedula, m.apellidos, m.nombres, j.serie || j.numero AS junta FROM mjrv m JOIN juntas_madrid j ON j.id = m.junta_origen_id WHERE m.cedula = $1 AND m.activo";
  const f = client
    ? (await client.query<Fila>(`${sql} AND (cne.en_prueba() OR NOT m.es_prueba) FOR SHARE OF m`, [cedula])).rows
    : await query<Fila>(sql, [cedula]);
  const m = f[0];
  if (!m) return null;
  return { mjrvId: m.id, cedula: m.cedula, nombre: `${m.apellidos}, ${m.nombres}`, iniciales: iniciales(m.nombres, m.apellidos), junta: m.junta, ...(await estadoDocumentos(m.id, client)) };
}

export async function versionDocumentos(mjrvId: number, client: PoolClient): Promise<string> {
  const { rows } = await client.query<FotoVersion>(
    `SELECT lado, creado_en::text AS capturado, encode(sha256, 'hex') AS hash FROM documentos_mjrv
       WHERE mjrv_id = $1 AND es_prueba = cne.en_prueba() ORDER BY lado`,
    [mjrvId],
  );
  return huellaFotos(rows);
}

export async function buscarParaValidacion(cedula: string, juntaId?: number) {
  return withTx(async (client) => {
    const { rows: [{ modo }] } = await client.query<{ modo: Modo }>("SELECT modo FROM configuracion WHERE id = 1 FOR SHARE");
    const ficha = await buscarPorCedula(cedula, client);
    if (!ficha) return null;
    const { rows: [validada] } = await client.query<{ fecha: string }>(
      "SELECT validada_en::text AS fecha FROM v_cedulas_validadas WHERE mjrv_id=$1", [ficha.mjrvId]);
    const { rows: [repetir] } = await client.query<{ fecha: string; motivo: string | null }>(
      "SELECT repetir_en::text AS fecha, motivo_repetir AS motivo FROM v_documentos_por_repetir WHERE mjrv_id=$1", [ficha.mjrvId]);
    const { rows: [asignacion] } = await client.query<{ id: number; junta: string }>(
      `SELECT j.id, j.serie || j.numero AS junta FROM v_mjrv_asignacion a
         JOIN juntas_madrid j ON j.id = a.junta_actual_id WHERE a.mjrv_id = $1`, [ficha.mjrvId]);
    if (juntaId !== undefined && asignacion?.id !== juntaId) return null;
    return { ...ficha, junta: asignacion?.junta ?? ficha.junta, modo, validada: ficha.completos && !!validada,
      revisionEn: repetir?.fecha ?? validada?.fecha ?? null,
      necesitaRepetir: !!repetir, motivoRepetir: repetir?.motivo ?? null, version: await versionDocumentos(ficha.mjrvId, client) };
  });
}

export type ResultadoFoto = { ok: true; estado: EstadoDocs } | { ok: false; status: 400 | 404 | 409; mensaje: string };

export async function borrarFotoDocumento(
  actor: { tipo: "usuario" | "operador"; id: number; nombre: string },
  datos: { id: number; lado: Lado; modo: Modo; version: string; juntaId?: number },
): Promise<ResultadoFoto> {
  const { id, lado, modo, version, juntaId } = datos;
  return withTx(async (client) => {
    const actual = (await client.query<{ modo: Modo }>("SELECT modo FROM configuracion WHERE id=1 FOR SHARE")).rows[0].modo;
    if (actual !== modo) return { ok: false, status: 409, mensaje: "El modo cambió. Vuelva a abrir la ficha." };
    const ficha = await client.query("SELECT 1 FROM mjrv WHERE id=$1 AND activo AND (cne.en_prueba() OR NOT es_prueba) FOR UPDATE", [id]);
    if (!ficha.rowCount || (juntaId !== undefined && !(await client.query(
      "SELECT 1 FROM v_mjrv_asignacion WHERE mjrv_id=$1 AND junta_actual_id=$2", [id, juntaId],
    )).rowCount)) return { ok: false, status: 404, mensaje: "La ficha no está disponible en esta junta." };
    await client.query("SELECT 1 FROM documentos_mjrv WHERE mjrv_id=$1 AND es_prueba=cne.en_prueba() FOR UPDATE", [id]);
    if (await versionDocumentos(id, client) !== version) return { ok: false, status: 409, mensaje: "Las fotos cambiaron. Vuelva a abrir la ficha." };
    if ((await client.query("SELECT 1 FROM pagos_confirmados WHERE mjrv_id=$1 AND es_prueba=cne.en_prueba()", [id])).rowCount) {
      return { ok: false, status: 409, mensaje: "El pago ya está confirmado. Consulte a Finanzas." };
    }
    if ((await client.query("SELECT 1 FROM v_cedulas_validadas WHERE mjrv_id=$1", [id])).rowCount) {
      return { ok: false, status: 409, mensaje: "El documento está validado. Pida a Finanzas que lo devuelva a revisión." };
    }
    const borrada = await client.query("DELETE FROM documentos_mjrv WHERE mjrv_id=$1 AND lado=$2 AND es_prueba=cne.en_prueba()", [id, lado]);
    if (!borrada.rowCount) return { ok: false, status: 404, mensaje: "La foto ya no está en la ficha." };
    await registrarAuditoria({ portal: "finanzas", actorTipo: actor.tipo, actorId: actor.id, actorNombre: actor.nombre,
      accion: "foto_documento_borrada", entidad: "mjrv", entidadId: id, datos: { modo, lado, junta: juntaId ?? null } }, client);
    return { ok: true, estado: await estadoDocumentos(id, client) };
  });
}

// Re-codifica con sharp (aplica la orientación y quita EXIF), cifra y guarda. Repetir una foto la sustituye.
export async function guardarDocumento(d: { mjrvId: number; lado: Lado; imagen: Buffer; origen: "publico" | "estacion"; operadorId?: number; enlaceId?: number; modoEsperado?: Modo }): Promise<ResultadoFoto> {
  const esPasaporte = d.lado === "pasaporte";
  if (d.imagen.length < MIN_BYTES) return { ok: false, status: 400, mensaje: "La imagen es demasiado pequeña o está vacía. Vuelva a fotografiar el documento." };
  if (d.imagen.length > MAX_BYTES) return { ok: false, status: 400, mensaje: "La imagen pesa más de 2 MB. Vuelva a tomarla." };
  let procesada: Buffer, ancho: number, alto: number;
  try {
    const r = await sharp(d.imagen).rotate().resize({ width: MAX_LADO_PX, height: MAX_LADO_PX, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer({ resolveWithObject: true });
    procesada = r.data; ancho = r.info.width; alto = r.info.height;
  } catch {
    return { ok: false, status: 400, mensaje: "No se pudo leer la imagen. Vuelva a tomarla." };
  }
  if (procesada.length < MIN_BYTES) return { ok: false, status: 400, mensaje: "La imagen no tiene detalle suficiente. Vuelva a tomarla con mejor luz." };
  const hash = sha256Bytes(procesada);
  return withTx(async (client) => {
    const { rows: [{ modo }] } = await client.query<{ modo: Modo }>("SELECT modo FROM configuracion WHERE id = 1 FOR SHARE");
    if (d.modoEsperado && d.modoEsperado !== modo) return { ok: false as const, status: 409 as const, mensaje: "El modo cambió. Actualice la página antes de guardar la foto." };
    if (!(await client.query("SELECT 1 FROM mjrv WHERE id = $1 AND activo AND (cne.en_prueba() OR NOT es_prueba) FOR UPDATE", [d.mjrvId])).rows[0]) return { ok: false as const, status: 404 as const, mensaje: "No se encontró la ficha." };
    const { rows: [previa] } = await client.query<{ sha256: Buffer }>(
      "SELECT sha256 FROM documentos_mjrv WHERE mjrv_id=$1 AND lado=$2 AND es_prueba=cne.en_prueba() FOR UPDATE", [d.mjrvId, d.lado]);
    if (!esPasaporte) {
      // El reverso no puede ser la misma foto que el anverso (ni al revés).
      const otro = (await client.query<{ sha256: Buffer }>(
        "SELECT sha256 FROM documentos_mjrv WHERE mjrv_id = $1 AND es_prueba = cne.en_prueba() AND lado IN ('anverso', 'reverso') AND lado <> $2", [d.mjrvId, d.lado])).rows[0];
      if (otro && Buffer.compare(otro.sha256, hash) === 0) return { ok: false as const, status: 409 as const, mensaje: "Esta foto es igual a la del otro lado del documento. Fotografíe el lado que falta." };
    }
    // Un expediente admite solo un tipo de documento. La sustitución y la nueva foto son atómicas.
    await client.query(
      "DELETE FROM documentos_mjrv WHERE mjrv_id = $1 AND es_prueba = cne.en_prueba() AND (lado = 'pasaporte') <> $2",
      [d.mjrvId, esPasaporte]);
    const { ciphertext, nonce } = encryptBuffer(procesada);
    await client.query(
      `INSERT INTO documentos_mjrv (mjrv_id, lado, imagen_cifrada, nonce, bytes, ancho, alto, sha256, origen, operador_id, enlace_id, creado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,clock_timestamp())
       ON CONFLICT (mjrv_id, lado, es_prueba) DO UPDATE SET imagen_cifrada = EXCLUDED.imagen_cifrada, nonce = EXCLUDED.nonce, bytes = EXCLUDED.bytes,
         ancho = EXCLUDED.ancho, alto = EXCLUDED.alto, sha256 = EXCLUDED.sha256, origen = EXCLUDED.origen, operador_id = EXCLUDED.operador_id,
         enlace_id = EXCLUDED.enlace_id, creado_en = EXCLUDED.creado_en`,
      [d.mjrvId, d.lado, ciphertext, nonce, procesada.length, ancho, alto, hash, d.origen, d.operadorId ?? null, d.enlaceId ?? null]);
    if (!previa || !previa.sha256.equals(hash)) {
      await client.query(`UPDATE cedulas_validadas SET repetir_en=NULL, motivo_repetir=NULL
        WHERE mjrv_id=$1 AND es_prueba=cne.en_prueba() AND repetir_en IS NOT NULL`, [d.mjrvId]);
    }
    return { ok: true as const, estado: await estadoDocumentos(d.mjrvId, client) };
  });
}

// Solo para el acta (M15) y la ficha del administrador, siempre tras la guarda correspondiente.
type DocumentoCifrado = { imagen_cifrada: Buffer; nonce: Buffer };
export async function leerDocumento(mjrvId: number, lado: Lado, client?: PoolClient, modoEsperado?: Modo): Promise<Buffer | null> {
  const sql = "SELECT imagen_cifrada, nonce FROM documentos_mjrv WHERE mjrv_id = $1 AND lado = $2 AND es_prueba = cne.en_prueba() AND ($3::text IS NULL OR es_prueba = ($3 = 'prueba'))";
  const params = [mjrvId, lado, modoEsperado ?? null];
  const [f] = client ? (await client.query<DocumentoCifrado>(sql, params)).rows : await query<DocumentoCifrado>(sql, params);
  return f ? decryptBuffer(f.imagen_cifrada, f.nonce) : null;
}

export async function leerDocumentoEnRevision(mjrvId: number, lado: Lado, modoEsperado: Modo, version: string, juntaId?: number): Promise<Buffer | null> {
  return withTx(async (client) => {
    const { rows: [{ modo }] } = await client.query<{ modo: Modo }>("SELECT modo FROM configuracion WHERE id = 1 FOR SHARE");
    if (modo !== modoEsperado) return null;
    const ficha = await client.query("SELECT 1 FROM mjrv WHERE id = $1 AND activo AND (cne.en_prueba() OR NOT es_prueba) FOR SHARE", [mjrvId]);
    if (!ficha.rowCount) return null;
    if (juntaId !== undefined && !(await client.query(
      "SELECT 1 FROM v_mjrv_asignacion WHERE mjrv_id = $1 AND junta_actual_id = $2", [mjrvId, juntaId],
    )).rowCount) return null;
    await client.query("SELECT 1 FROM documentos_mjrv WHERE mjrv_id = $1 AND es_prueba = cne.en_prueba() FOR SHARE", [mjrvId]);
    if (await versionDocumentos(mjrvId, client) !== version) return null;
    return leerDocumento(mjrvId, lado, client, modoEsperado);
  });
}

export async function documentosParaRecibo(mjrvId: number, client?: PoolClient): Promise<Partial<Record<Lado, Buffer>> | undefined> {
  const sql = "SELECT lado, imagen_cifrada, nonce FROM documentos_mjrv WHERE mjrv_id = $1 AND es_prueba = cne.en_prueba()";
  const params = [mjrvId];
  type Fila = DocumentoCifrado & { lado: Lado };
  const filas = client ? (await client.query<Fila>(sql, params)).rows : await query<Fila>(sql, params);
  if (!filas.length) return undefined;
  const anexo: Partial<Record<Lado, Buffer>> = {};
  for (const f of filas) anexo[f.lado] = decryptBuffer(f.imagen_cifrada, f.nonce);
  return anexo;
}

// Holgado: en la Caja Mágica muchos MJRV pueden salir por la misma IP de la Wi-Fi.
export const LIMITE_PUBLICO = 150; // consultas por IP en 15 minutos
export const LIMITE_FOTOS_PUBLICO = 400;

// Cuenta y anota el intento; devuelve false si la IP ya llegó al límite.
export async function permitirPublico(ip: string | null, tipo: "buscar" | "foto"): Promise<boolean> {
  const clave = `publico:${tipo}:${ip ?? "sin-ip"}`;
  const n = (await query<{ n: number }>("SELECT count(*)::int AS n FROM intentos_acceso WHERE clave = $1 AND creado_en > now() - interval '15 minutes'", [clave]))[0].n;
  if (n >= (tipo === "buscar" ? LIMITE_PUBLICO : LIMITE_FOTOS_PUBLICO)) return false;
  await query("INSERT INTO intentos_acceso (clave, exito) VALUES ($1, true)", [clave]);
  return true;
}

// Cloudflare pone CF-Connecting-IP; si falta, la primera de X-Forwarded-For.
export function ipDeSolicitud(headers: Headers): string | null {
  return headers.get("cf-connecting-ip") || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

// ───────────── Borrado de todas las fotos (superadmin, 10d) ─────────────
// El borrado masivo usa el dueño del esquema y se acota al modo actual (prueba o elección).
export const FRASE_BORRAR_FOTOS = "BORRAR FOTOS";
// El dueño del esquema puede saltarse la seguridad por filas: se acota el borrado al modo actual de forma explícita.
const MODO_ACTUAL = "(SELECT modo = 'prueba' FROM cne.configuracion WHERE id = 1)";
export type ResumenFotos = { fotos: number; personas: number; sinPago: number };

export async function resumenFotos(): Promise<ResumenFotos> {
  const f = (await query<ResumenFotos>(
    `SELECT count(*)::int AS fotos, count(DISTINCT d.mjrv_id)::int AS personas,
            count(DISTINCT d.mjrv_id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM pagos_confirmados p WHERE p.mjrv_id = d.mjrv_id))::int AS "sinPago"
       FROM documentos_mjrv d`))[0];
  return f;
}

export async function borrarTodasLasFotos(sesion: Sesion, confirmacion: string): Promise<{ ok: true; borradas: number; personas: number } | { ok: false; mensaje: string }> {
  if (sesion.tipo !== "superadmin") throw new Error("Solo la superadministración puede hacer esto.");
  if (normalizarFrase(confirmacion) !== FRASE_BORRAR_FOTOS) return { ok: false, mensaje: `Escriba «${FRASE_BORRAR_FOTOS}» para confirmar. No se borró nada.` };
  return withOwnerTx(async (client) => {
    const antes = (await client.query<{ fotos: number; personas: number; sin_pago: number }>(
      `SELECT count(*)::int AS fotos, count(DISTINCT d.mjrv_id)::int AS personas,
              count(DISTINCT d.mjrv_id) FILTER (WHERE NOT EXISTS (SELECT 1 FROM cne.pagos_confirmados p WHERE p.mjrv_id = d.mjrv_id))::int AS sin_pago
         FROM cne.documentos_mjrv d WHERE d.es_prueba = ${MODO_ACTUAL}`)).rows[0];
    const r = await client.query(`DELETE FROM cne.documentos_mjrv WHERE es_prueba = ${MODO_ACTUAL}`);
    await registrarAuditoria({
      portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "fotos_cedula_borradas", entidad: "documentos_mjrv",
      datos: { fotos: r.rowCount ?? 0, personas: antes.personas, sin_pago_confirmado: antes.sin_pago },
    }, client);
    return { ok: true as const, borradas: r.rowCount ?? 0, personas: antes.personas };
  });
}
