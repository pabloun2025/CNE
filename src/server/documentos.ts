import sharp from "sharp";
import type { PoolClient } from "pg";
import { sha256Bytes } from "../domain/text";
import { decryptBuffer, encryptBuffer } from "./crypto";
import { normalizarFrase } from "../domain/limpieza";
import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { query, withOwnerTx, withTx } from "./db";

export type Lado = "anverso" | "reverso";
export const MIN_BYTES = 20_000;
export const MAX_BYTES = 2_000_000;
const MAX_LADO_PX = 1200;

export type EstadoDocs = { anverso: boolean; reverso: boolean; completos: boolean };
export type Busqueda = { mjrvId: number; iniciales: string; junta: string } & EstadoDocs;
export type BusquedaCompleta = Busqueda & { nombre: string; cedula: string };

const normalizarCedula = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "");
const iniciales = (nombres: string, apellidos: string) => `${nombres.trim()[0] ?? "?"}. ${apellidos.trim()[0] ?? "?"}.`;

export async function estadoDocumentos(mjrvId: number): Promise<EstadoDocs> {
  const f = await query<{ lado: Lado }>("SELECT lado FROM documentos_mjrv WHERE mjrv_id = $1", [mjrvId]);
  const anverso = f.some((x) => x.lado === "anverso"), reverso = f.some((x) => x.lado === "reverso");
  return { anverso, reverso, completos: anverso && reverso };
}

// Búsqueda por cédula. El formulario público solo recibe iniciales y junta; la estación ve el nombre completo.
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
export async function guardarDocumento(d: { mjrvId: number; lado: Lado; imagen: Buffer; origen: "publico" | "estacion"; operadorId?: number; enlaceId?: number }): Promise<ResultadoFoto> {
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
    await client.query("SELECT id FROM configuracion WHERE id = 1 FOR SHARE");
    if (!(await client.query("SELECT 1 FROM mjrv WHERE id = $1 AND activo FOR UPDATE", [d.mjrvId])).rows[0]) return { ok: false as const, status: 404 as const, mensaje: "No se encontró la ficha." };
    // El reverso no puede ser la misma foto que el anverso (ni al revés).
    const otro = (await client.query<{ sha256: Buffer }>("SELECT sha256 FROM documentos_mjrv WHERE mjrv_id = $1 AND lado <> $2", [d.mjrvId, d.lado])).rows[0];
    if (otro && Buffer.compare(otro.sha256, hash) === 0) return { ok: false as const, status: 409 as const, mensaje: "Esta foto es igual a la del otro lado del documento. Fotografíe el lado que falta." };
    const { ciphertext, nonce } = encryptBuffer(procesada);
    await client.query(
      `INSERT INTO documentos_mjrv (mjrv_id, lado, imagen_cifrada, nonce, bytes, ancho, alto, sha256, origen, operador_id, enlace_id, creado_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,clock_timestamp())
       ON CONFLICT (mjrv_id, lado, es_prueba) DO UPDATE SET imagen_cifrada = EXCLUDED.imagen_cifrada, nonce = EXCLUDED.nonce, bytes = EXCLUDED.bytes,
         ancho = EXCLUDED.ancho, alto = EXCLUDED.alto, sha256 = EXCLUDED.sha256, origen = EXCLUDED.origen, operador_id = EXCLUDED.operador_id,
         enlace_id = EXCLUDED.enlace_id, creado_en = EXCLUDED.creado_en`,
      [d.mjrvId, d.lado, ciphertext, nonce, procesada.length, ancho, alto, hash, d.origen, d.operadorId ?? null, d.enlaceId ?? null]);
    const lados = (await client.query<{ lado: Lado }>("SELECT lado FROM documentos_mjrv WHERE mjrv_id = $1", [d.mjrvId])).rows.map((r) => r.lado);
    return { ok: true as const, estado: { anverso: lados.includes("anverso"), reverso: lados.includes("reverso"), completos: lados.length === 2 } };
  });
}

// Solo para el acta (M15) y la ficha del administrador, siempre tras la guarda correspondiente.
export async function leerDocumento(mjrvId: number, lado: Lado, client?: PoolClient): Promise<Buffer | null> {
  const sql = "SELECT imagen_cifrada, nonce FROM documentos_mjrv WHERE mjrv_id = $1 AND lado = $2";
  const params = [mjrvId, lado];
  type DocumentoCifrado = { imagen_cifrada: Buffer; nonce: Buffer };
  const [f] = client ? (await client.query<DocumentoCifrado>(sql, params)).rows : await query<DocumentoCifrado>(sql, params);
  return f ? decryptBuffer(f.imagen_cifrada, f.nonce) : null;
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
// Las fotos se conservan hasta que la superadmin pulse el botón. cne_app no tiene DELETE, así que va con el dueño del esquema;
// la seguridad por filas limita el borrado al modo actual (prueba o elección). Las copias de seguridad diarias guardan las fotos cifradas hasta 14 días.
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
