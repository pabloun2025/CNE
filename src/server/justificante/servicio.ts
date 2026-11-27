import { createPrivateKey, createPublicKey, hkdfSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { decryptBuffer, encryptBuffer, masterKey } from "../crypto";
import { query } from "../db";
import { correoElectoral } from "../envios/correo-electoral";
import { canjearEmision } from "./emision.mjs";
import { prepararDocumentoLaboral, validarDocumentoEspanol } from "./documento.mjs";

const recursos = join(process.cwd(), "src/server/recursos-electorales");
const puesto = "madrid-ventanilla-2026";
const contexto = "madrid.consulado.app/justificante-laboral/sesion/v1";
const idTicket = /^[A-Za-z0-9_-]{16}$/;
const idSolicitud = /^[0-9a-f]{32}$/;
const direccionCorreo = z.email().max(254);
type Titular = { nombre: string; cedula: string; vence: number; ticket?: string; solicitud?: string };
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

async function reservarTurnoCorreo(id: string, solicitud: string, vence: number) {
  // Cada ticket conserva hasta tres turnos de correo, incluso si se abre más veces.
  const [fila] = await query<{ vence: Date }>(`
    INSERT INTO cne.aperturas_justificante AS a (documento,solicitudes,vencimientos)
    VALUES ($1,ARRAY[$2::uuid],ARRAY[to_timestamp($3::double precision / 1000)])
    ON CONFLICT (documento) DO UPDATE SET
      solicitudes = CASE WHEN $2::uuid=ANY(a.solicitudes) THEN a.solicitudes ELSE a.solicitudes || EXCLUDED.solicitudes END,
      vencimientos = CASE WHEN $2::uuid=ANY(a.solicitudes) THEN a.vencimientos ELSE a.vencimientos || EXCLUDED.vencimientos END
    WHERE $2::uuid=ANY(a.solicitudes) OR cardinality(a.solicitudes)<3
    RETURNING vencimientos[array_position(solicitudes,$2::uuid)] AS vence
  `, [id, solicitud, vence]);
  return fila;
}

export async function abrirJustificante(token: unknown, solicitud: unknown) {
  if (typeof solicitud !== "string" || !idSolicitud.test(solicitud))
    throw new ErrorJustificante(400, "Vuelva a abrir el formulario desde su ticket.");
  const privada = receptor();
  const emisor = createPublicKey(readFileSync(join(recursos, "emisor-ventanilla-public.pem")));
  let doc;
  try { doc = canjearEmision(token, { clavesPuestos: { [puesto]: emisor }, clavePrivada: privada }); }
  catch { throw new ErrorJustificante(403, "El código de su ticket no es válido."); }
  const plain = Buffer.from(JSON.stringify({ contexto, vence: Date.now() + 3_600_000, nombre: doc.nombre, cedula: doc.cedula,
    ticket: doc.id, solicitud }));
  try {
    const { nonce, ciphertext } = encryptBuffer(plain);
    return { sesion: Buffer.concat([nonce,ciphertext]).toString("base64url"), nombre: doc.nombre, cedula: doc.cedula };
  } finally { plain.fill(0); }
}

function leerSesion(sesion: unknown): Titular {
  let titular;
  try {
    if (typeof sesion !== "string" || !/^[a-zA-Z0-9_-]{60,1600}$/.test(sesion)) throw Error();
    const bytes = Buffer.from(sesion, "base64url");
    const plain = decryptBuffer(bytes.subarray(12), bytes.subarray(0, 12));
    try { titular = JSON.parse(plain.toString()); } finally { plain.fill(0); }
    if (titular.contexto !== contexto || !Number.isSafeInteger(titular.vence) || titular.vence <= Date.now() || typeof titular.nombre !== "string" || !/^\d{10}$/.test(titular.cedula)) throw Error();
  } catch { throw new ErrorJustificante(403, "Su sesión ha caducado. Escanee de nuevo el ticket."); }
  return titular;
}

function generarPDF(titular: Titular, numero: unknown) {
  let documento;
  try {
    if (typeof numero !== "string" || numero.length > 16) throw Error("Revise su DNI o NIE.");
    documento = validarDocumentoEspanol(numero);
  } catch (e) { throw new ErrorJustificante(400, (e as Error).message); }
  return prepararDocumentoLaboral(readFileSync(join(recursos, "base-justificante-laboral.pdf")), readFileSync(join(recursos, "noto-serif-bold.ttf")),
    { nombre: titular.nombre, cedula: titular.cedula, documento });
}

export function descargarJustificante(sesion: unknown, numero: unknown) {
  return generarPDF(leerSesion(sesion), numero);
}

export async function enviarJustificante(sesion: unknown, numero: unknown, correo: unknown) {
  const titular = leerSesion(sesion);
  const { ticket, solicitud } = titular;
  if (!ticket || !idTicket.test(ticket) || !solicitud || !idSolicitud.test(solicitud))
    throw new ErrorJustificante(403, "Para enviar el PDF por correo, vuelva a abrir el formulario desde su ticket.");
  const direccion = typeof correo === "string" ? correo.trim() : "";
  if (!direccionCorreo.safeParse(direccion).success)
    throw new ErrorJustificante(400, "Revise el correo electrónico.");
  const pdf = await generarPDF(titular, numero);
  const { proveedor, remitente, habilitado } = await correoElectoral();
  if (!habilitado)
    throw new ErrorJustificante(503, "El envío por correo no está disponible en este momento. Puede descargar el PDF.");
  if (Date.now() >= titular.vence)
    throw new ErrorJustificante(403, "Su sesión ha caducado. Escanee de nuevo el ticket.");

  const turno = await reservarTurnoCorreo(ticket, solicitud, titular.vence);
  if (!turno)
    throw new ErrorJustificante(429, "Ya se solicitaron tres envíos para este ticket. Todavía puede descargar el PDF.");

  // Solo una solicitud por turno puede reservar el envío, incluso desde varias pestañas.
  const [reserva] = await query(`
    INSERT INTO cne.envios_justificante AS envio (documento, solicitud, estado)
    SELECT documento, $2::uuid, 'enviando' FROM cne.aperturas_justificante
    WHERE documento=$1 AND vencimientos[array_position(solicitudes,$2::uuid)] > clock_timestamp()
    ON CONFLICT (documento, solicitud) DO UPDATE SET estado='enviando'
    WHERE envio.estado='disponible' RETURNING documento
  `, [ticket, solicitud]);
  if (!reserva)
    throw new ErrorJustificante(409, "El envío ya se solicitó o la sesión caducó. Revise su bandeja de entrada.");

  const resultado = await proveedor.enviar({
    para: direccion,
    remitente: { direccion: remitente.direccion, nombre: remitente.nombre || "Consulado General del Ecuador en Madrid" },
    asunto: "Su justificante laboral",
    texto: "Adjuntamos el justificante laboral que solicitó desde el ticket del puesto de información electoral de Madrid.",
    adjunto: { nombre: "justificante-laboral.pdf", base64: Buffer.from(pdf).toString("base64") },
  }).catch(() => ({ ok: false as const, incierto: true }));
  const estado = resultado.ok ? "aceptado" : resultado.incierto ? "incierto" : "disponible";
  await query("UPDATE cne.envios_justificante SET estado=$3 WHERE documento=$1 AND solicitud=$2::uuid", [ticket, solicitud, estado]);
  if (!resultado.ok) throw new ErrorJustificante(503, resultado.incierto
    ? "El proveedor no confirmó el envío. Revise su bandeja de entrada."
    : "No se pudo enviar el PDF. Revise su correo electrónico e inténtelo de nuevo.");
  return { aceptado: true };
}
