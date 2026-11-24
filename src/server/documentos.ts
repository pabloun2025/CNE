import sharp from "sharp";
import type { PoolClient } from "pg";
import { sha256Bytes } from "../domain/text";
import type { EstadoDocs, LadoDocumento } from "../domain/documentos";
import { decryptBuffer, encryptBuffer } from "./crypto";
import { normalizarFrase } from "../domain/limpieza";
import type { Sesion } from "./auth";
import type { Modo } from "./config";
import { registrarAuditoria } from "./auditoria";
import { query, withOwnerTx, withTx } from "./db";

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

export type FichaDocumentosFinanzas = { id: number; nombre: string; cedula: string; junta: string } & EstadoDocs;

export async function listarDocumentosFinanzas(): Promise<{ modo: Modo; fichas: FichaDocumentosFinanzas[] }> {
  return withTx(async (client) => {
    const { rows: [{ modo }] } = await client.query<{ modo: Modo }>("SELECT modo FROM configuracion WHERE id = 1 FOR SHARE");
    const { rows } = await client.query<Omit<FichaDocumentosFinanzas, keyof EstadoDocs> & { lados: Lado[] }>(
      `SELECT m.id, m.apellidos || ', ' || m.nombres AS nombre, m.cedula, j.serie || j.numero AS junta,
              coalesce(d.lados, ARRAY[]::text[]) AS lados
         FROM mjrv m JOIN juntas_madrid j ON j.id = m.junta_origen_id
         LEFT JOIN LATERAL (
           SELECT array_agg(f.lado) AS lados FROM documentos_mjrv f
           WHERE f.mjrv_id = m.id AND f.es_prueba = cne.en_prueba()
         ) d ON true
        WHERE m.activo AND (cne.en_prueba() OR NOT m.es_prueba)
        ORDER BY j.serie, j.numero, m.apellidos, m.nombres, m.id`);
    return { modo, fichas: rows.map(({ lados, ...ficha }) => ({ ...ficha, ...estadoDeLados(lados) })) };
  });
}

// La búsqueda usa el número del padrón. El formulario público solo recibe iniciales y junta; la estación ve el nombre completo.
export async function buscarPorCedula(cedulaBruta: string): Promise<BusquedaCompleta | null> {
  const cedula = normalizarCedula(cedulaBruta).slice(0, 20);
  const f = await query<{ id: number; cedula: string; apellidos: string; nombres: string; junta: string }>(
    "SELECT m.id, m.cedula, m.apellidos, m.nombres, j.serie || j.numero AS junta FROM mjrv m JOIN juntas_madrid j ON j.id = m.junta_origen_id WHERE m.cedula = $1 AND m.activo", [cedula]);
  const m = f[0];
  if (!m) return null;
  return { mjrvId: m.id, cedula: m.cedula, nombre: `${m.apellidos}, ${m.nombres}`, iniciales: iniciales(m.nombres, m.apellidos), junta: m.junta, ...(await estadoDocumentos(m.id)) };
}

export type ResultadoFoto = { ok: true; estado: EstadoDocs } | { ok: false; status: 400 | 404 | 409; mensaje: string };

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
    if (!(await client.query("SELECT 1 FROM mjrv WHERE id = $1 AND activo FOR UPDATE", [d.mjrvId])).rows[0]) return { ok: false as const, status: 404 as const, mensaje: "No se encontró la ficha." };
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
