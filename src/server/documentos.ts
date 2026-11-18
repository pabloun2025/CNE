import sharp from "sharp";
import { sha256Bytes } from "../domain/text";
import { decryptBuffer, encryptBuffer } from "./crypto";
import { query, withTx } from "./db";

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
export async function guardarDocumento(d: { mjrvId: number; lado: Lado; imagen: Buffer; origen: "publico" | "estacion"; operadorId?: number }): Promise<ResultadoFoto> {
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
    if (!(await client.query("SELECT 1 FROM mjrv WHERE id = $1 AND activo", [d.mjrvId])).rows[0]) return { ok: false as const, status: 404 as const, mensaje: "No se encontró la ficha." };
    // El reverso no puede ser la misma foto que el anverso (ni al revés).
    const otro = (await client.query<{ sha256: Buffer }>("SELECT sha256 FROM documentos_mjrv WHERE mjrv_id = $1 AND lado <> $2", [d.mjrvId, d.lado])).rows[0];
    if (otro && Buffer.compare(otro.sha256, hash) === 0) return { ok: false as const, status: 409 as const, mensaje: "Esta foto es igual a la del otro lado del documento. Fotografíe el lado que falta." };
    const { ciphertext, nonce } = encryptBuffer(procesada);
    await client.query(
      `INSERT INTO documentos_mjrv (mjrv_id, lado, imagen_cifrada, nonce, bytes, ancho, alto, sha256, origen, operador_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (mjrv_id, lado, es_prueba) DO UPDATE SET imagen_cifrada = EXCLUDED.imagen_cifrada, nonce = EXCLUDED.nonce, bytes = EXCLUDED.bytes,
         ancho = EXCLUDED.ancho, alto = EXCLUDED.alto, sha256 = EXCLUDED.sha256, origen = EXCLUDED.origen, operador_id = EXCLUDED.operador_id, creado_en = now()`,
      [d.mjrvId, d.lado, ciphertext, nonce, procesada.length, ancho, alto, hash, d.origen, d.operadorId ?? null]);
    const lados = (await client.query<{ lado: Lado }>("SELECT lado FROM documentos_mjrv WHERE mjrv_id = $1", [d.mjrvId])).rows.map((r) => r.lado);
    return { ok: true as const, estado: { anverso: lados.includes("anverso"), reverso: lados.includes("reverso"), completos: lados.length === 2 } };
  });
}

// Solo para el acta (M15) y la ficha del administrador, siempre tras la guarda correspondiente.
export async function leerDocumento(mjrvId: number, lado: Lado): Promise<Buffer | null> {
  const f = await query<{ imagen_cifrada: Buffer; nonce: Buffer }>("SELECT imagen_cifrada, nonce FROM documentos_mjrv WHERE mjrv_id = $1 AND lado = $2", [mjrvId, lado]);
  return f[0] ? decryptBuffer(f[0].imagen_cifrada, f[0].nonce) : null;
}

// ───────────── Formulario público ─────────────
export async function formularioAbierto(): Promise<boolean> {
  return (await query<{ a: boolean }>("SELECT documentos_publico_abierto AS a FROM configuracion WHERE id = 1"))[0]?.a ?? false;
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

export async function fijarFormulario(abierto: boolean, usuarioId: number): Promise<void> {
  await query("UPDATE configuracion SET documentos_publico_abierto = $1, actualizado_en = now(), actualizado_por = $2 WHERE id = 1", [abierto, usuarioId]);
}
