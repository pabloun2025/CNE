import { createPrivateKey, createPublicKey, hkdfSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decryptBuffer, encryptBuffer, masterKey } from "../crypto";
import { query } from "../db";
import { canjearEmision } from "./emision.mjs";
import { prepararDocumentoLaboral, validarDocumentoEspanol } from "./documento.mjs";

const recursos = join(process.cwd(), "src/server/recursos-electorales");
const puesto = "madrid-ventanilla-2026";
const contexto = "madrid.consulado.app/justificante-laboral/sesion/v1";
export class ErrorJustificante extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export function receptor() {
  const maestra = masterKey();
  const semilla = Buffer.from(hkdfSync("sha256", maestra, "CNE-Madrid-2026-11-29", "justificante-laboral/receptor-x25519/v1", 32));
  const der = Buffer.concat([Buffer.from("302e020100300506032b656e04220420", "hex"), semilla]);
  try { return createPrivateKey({ key: der, format: "der", type: "pkcs8" }); }
  finally { maestra.fill(0); semilla.fill(0); der.fill(0); }
}

export function clavePublicaReceptor() {
  return createPublicKey(receptor()).export({ format: "pem", type: "spki" });
}

export async function registrarApertura(id: string, solicitud: string) {
  // El conflicto bloquea la fila. Un reintento recupera el mismo vencimiento sin gastar otro uso.
  const [fila] = await query<{ restantes: number; vence: Date }>(`
    INSERT INTO cne.aperturas_justificante AS a (documento,solicitudes,vencimientos)
    VALUES ($1,ARRAY[$2::uuid],ARRAY[now()+interval '1 hour'])
    ON CONFLICT (documento) DO UPDATE SET
      solicitudes = CASE WHEN $2::uuid=ANY(a.solicitudes) THEN a.solicitudes ELSE a.solicitudes || EXCLUDED.solicitudes END,
      vencimientos = CASE WHEN $2::uuid=ANY(a.solicitudes) THEN a.vencimientos ELSE a.vencimientos || EXCLUDED.vencimientos END
    WHERE $2::uuid=ANY(a.solicitudes) OR cardinality(a.solicitudes)<3
    RETURNING 3-cardinality(solicitudes) AS restantes, vencimientos[array_position(solicitudes,$2::uuid)] AS vence
  `, [id, solicitud]);
  return fila;
}

export async function abrirJustificante(token: unknown, solicitud: unknown) {
  if (typeof solicitud !== "string" || !/^[0-9a-f]{32}$/.test(solicitud))
    throw new ErrorJustificante(400, "Vuelva a abrir el formulario desde su ticket.");
  const privada = receptor();
  const emisor = createPublicKey(readFileSync(join(recursos, "emisor-ventanilla-public.pem")));
  let doc;
  try { doc = canjearEmision(token, { clavesPuestos: { [puesto]: emisor }, clavePrivada: privada }); }
  catch { throw new ErrorJustificante(403, "El código de su ticket no es válido."); }
  const uso = await registrarApertura(doc.id, solicitud);
  if (!uso || uso.vence.getTime() <= Date.now())
    throw new ErrorJustificante(410, "El ticket ha agotado sus aperturas o esta sesión ha caducado.");
  const plain = Buffer.from(JSON.stringify({ contexto, vence: uso.vence.getTime(), nombre: doc.nombre, cedula: doc.cedula }));
  try {
    const { nonce, ciphertext } = encryptBuffer(plain);
    return { sesion: Buffer.concat([nonce,ciphertext]).toString("base64url"), restantes: uso.restantes, nombre: doc.nombre, cedula: doc.cedula };
  } finally { plain.fill(0); }
}

export async function descargarJustificante(sesion: unknown, numero: unknown) {
  let titular;
  try {
    if (typeof sesion !== "string" || !/^[a-zA-Z0-9_-]{60,1600}$/.test(sesion)) throw Error();
    const bytes = Buffer.from(sesion, "base64url");
    const plain = decryptBuffer(bytes.subarray(12), bytes.subarray(0, 12));
    try { titular = JSON.parse(plain.toString()); } finally { plain.fill(0); }
    if (titular.contexto !== contexto || !Number.isSafeInteger(titular.vence) || titular.vence <= Date.now() || typeof titular.nombre !== "string" || !/^\d{10}$/.test(titular.cedula)) throw Error();
  } catch { throw new ErrorJustificante(403, "Su sesión ha caducado. Escanee de nuevo el ticket."); }
  let documento;
  try {
    if (typeof numero !== "string" || numero.length > 16) throw Error("Revise su DNI o NIE.");
    documento = validarDocumentoEspanol(numero);
  } catch (e) { throw new ErrorJustificante(400, (e as Error).message); }
  return prepararDocumentoLaboral(readFileSync(join(recursos, "base-justificante-laboral.pdf")), readFileSync(join(recursos, "noto-serif-bold.ttf")),
    { nombre: titular.nombre, cedula: titular.cedula, documento });
}
