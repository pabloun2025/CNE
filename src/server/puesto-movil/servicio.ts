import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";
import { z } from "zod";
import { decryptBuffer, encryptBuffer, masterKey } from "../crypto";
import { query } from "../db";
import { correoElectoral } from "../envios/correo-electoral";
import { ErrorJustificante } from "../justificante/servicio";
import { prepararDocumentoLaboral, validarDocumentoEspanol } from "../justificante/documento.mjs";
import { consultarPadronMovil, estadoPadronMovil } from "./padron";
import { credencialesMovil } from "./credenciales";
import { guardarContactoAusente } from "./contactos";

const recursos = join(process.cwd(), "src/server/recursos-electorales");
const formatoAcceso = /^[A-Za-z0-9_-]{43}$/;
const formatoCedula = /^\d{10}$/;
const formatoUuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const email = z.email().max(254);
const contexto = "puesto-movil/madrid/turno/v1";

type Tipo = "con" | "sin";
type Turno = { contexto: string; id: string; cedula: string; vence: number; tipo: Tipo };
type EstadoEnvio = "pendiente" | "enviando" | "aceptado" | "incierto";

export function origenMovilValido(origen: string) {
  return origen === (process.env.CNE_MOVIL_ORIGEN || "https://madrid.consulado.app") || origen === "https://cne.consulado.app";
}

function fallo(status: number, message: string): never {
  throw new ErrorJustificante(status, message);
}

export function estadoMovil() {
  const estado = estadoPadronMovil();
  return { ...estado, disponible: estado.disponible && formatoAcceso.test(credencialesMovil().acceso ?? "") };
}

export function verificarAcceso(request: Request, seguimiento = false) {
  const credenciales = credencialesMovil();
  const config = seguimiento ? credenciales.seguimiento : credenciales.acceso;
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{18}|[A-Za-z0-9_-]{43})$/)?.[1];
  const esperado = !seguimiento && token?.length === 18 ? config?.slice(0, 18) : config;
  if (!config || !formatoAcceso.test(config) || !token ||
      (seguimiento && config === credenciales.acceso) ||
      !esperado || !timingSafeEqual(createHash("sha256").update(token).digest(), createHash("sha256").update(esperado).digest())) {
    fallo(403, seguimiento ? "Abra el enlace de seguimiento." : "Abra el enlace para voluntarios.");
  }
}

const cuotas = new Map<string, number>();
let ventana = -1;
export function limitar(request: Request, operacion: string) {
  const minuto = Math.floor(Date.now() / 60_000);
  if (ventana !== minuto) { cuotas.clear(); ventana = minuto; }
  const direccion = request.headers.get("cf-connecting-ip") ?? "";
  const ip = isIP(direccion) ? direccion : "proxy";
  const global = operacion + "/total";
  const cliente = operacion + "/" + ip;
  const max = operacion === "envio" ? 120 : 240;
  if ((cuotas.get(global) ?? 0) >= max * 10 || (cuotas.get(cliente) ?? 0) >= max)
    fallo(429, "Hay muchas solicitudes. Espere un minuto y vuelva a intentarlo.");
  for (const clave of [global, cliente]) cuotas.set(clave, (cuotas.get(clave) ?? 0) + 1);
}

function exigirPadron() {
  const estado = estadoMovil();
  if (!estado.abierto) fallo(410, "La consulta del padrón ha cerrado.");
  if (!estado.disponible) fallo(503, "El padrón móvil aún no está disponible.");
  return estado;
}

function buscar(cedula: string) {
  exigirPadron();
  try { return consultarPadronMovil(cedula); }
  catch (error) {
    if ((error as { code?: string }).code === "PADRON_CERRADO") fallo(410, "La consulta del padrón ha cerrado.");
    throw error;
  }
}

function generarTurno(turno: Turno) {
  const plain = Buffer.from(JSON.stringify(turno));
  try {
    const { nonce, ciphertext } = encryptBuffer(plain);
    return Buffer.concat([nonce, ciphertext]).toString("base64url");
  } finally { plain.fill(0); }
}

function leerTurno(valor: unknown): Turno {
  try {
    if (typeof valor !== "string" || !/^[A-Za-z0-9_-]{60,600}$/.test(valor)) throw Error();
    const bytes = Buffer.from(valor, "base64url");
    if (bytes.toString("base64url") !== valor) throw Error();
    const plain = decryptBuffer(bytes.subarray(12), bytes.subarray(0, 12));
    let d;
    try { d = JSON.parse(plain.toString("utf8")); } finally { plain.fill(0); }
    if (d.contexto !== contexto || !formatoUuid.test(d.id) || !formatoCedula.test(d.cedula) ||
        !Number.isSafeInteger(d.vence) || Date.now() >= d.vence || !["con", "sin"].includes(d.tipo)) throw Error();
    return d;
  } catch { fallo(409, "La consulta ha caducado. Vuelva a buscar la cédula."); }
}

export async function consultar(cedula: unknown) {
  if (typeof cedula !== "string" || !formatoCedula.test(cedula)) fallo(400, "Ingrese los 10 dígitos de la cédula.");
  const elector = buscar(cedula);
  const { cierreMs } = exigirPadron();
  const tipo = elector ? "con" : "sin";
  const id = randomUUID();
  const turno = generarTurno({ contexto, id, cedula, vence: Math.min(cierreMs, Date.now() + 10 * 60_000), tipo });
  await query("INSERT INTO cne.puesto_movil_actividad (id,tipo) VALUES ($1,$2)", [id, tipo]);
  exigirPadron();
  return {
    resultado: elector ? { junta: elector.junta, zona: elector.zona, recinto: elector.recinto, verificarWeb: elector.verificarWeb } : null,
    turno,
  };
}

function nombreValido(input: unknown): string {
  if (typeof input !== "string" || input.length > 150 || /[\p{Cc}\p{Cf}]/u.test(input)) fallo(400, "Revise los nombres y apellidos.");
  const nombre = input.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (nombre.length < 2 || nombre.length > 120 || !/\p{L}/u.test(nombre)) fallo(400, "Ingrese los nombres y apellidos.");
  return nombre;
}

function huellaEnvio(id: string, correo: string, nombre: string, documento: string | null) {
  const clave = masterKey();
  try { return createHmac("sha256", clave).update(JSON.stringify([contexto, id, correo, nombre, documento])).digest("hex"); }
  finally { clave.fill(0); }
}

function informacion(tipo: Tipo, elector: ReturnType<typeof consultarPadronMovil>) {
  if (tipo === "sin") {
    return "La cédula consultada no consta en el padrón de este puesto.\nGuía sobre el voto en el exterior y la justificación electoral: https://madrid.consulado.app/guia-electoral.pdf";
  }
  const junta = elector?.junta?.replace(/^([MF])(\d+)$/, "$2$1");
  if (elector?.verificarWeb || !junta || (elector?.recinto === "Caja Mágica" && !elector.zona)) {
    return [elector?.recinto ? "Ubicación indicada: " + elector.recinto : "", junta ? "Código del padrón: " + junta : "",
      "Verifique su junta y el recinto en https://lugarvotacion.cne.gob.ec/"].filter(Boolean).join("\n");
  }
  return ["Recinto: " + elector?.recinto, "Junta: " + junta, elector?.zona ? "Zona: " + elector.zona : ""].filter(Boolean).join("\n");
}

async function cambiarEstado(id: string, estado: EstadoEnvio) {
  await query("UPDATE cne.puesto_movil_actividad SET estado=$2 WHERE id=$1 AND estado='enviando'", [id, estado]);
}

export async function diagnosticoCorreo() {
  const { configurado, habilitado } = await correoElectoral();
  return { configurado, remitenteVerificado: habilitado };
}

export async function enviar(datos: Record<string, unknown>) {
  exigirPadron();
  const turno = leerTurno(datos.turno);
  const correo = typeof datos.correo === "string" ? datos.correo.trim() : "";
  if (!email.safeParse(correo).success) fallo(400, "Revise el correo electrónico.");
  let documento;
  try {
    if (datos.documento !== undefined && (typeof datos.documento !== "string" || datos.documento.length > 16)) throw Error("Revise su DNI o NIE.");
    documento = validarDocumentoEspanol(datos.documento);
  } catch (error) { fallo(400, (error as Error).message); }

  const elector = buscar(turno.cedula);
  if ((elector ? "con" : "sin") !== turno.tipo) fallo(409, "Actualice la consulta antes de enviar.");
  const nombre = elector?.nombre ?? nombreValido(datos.nombre);
  const huella = huellaEnvio(turno.id, correo, nombre, documento?.numero ?? null);
  const [actividad] = await query<{ estado: EstadoEnvio; huella_peticion: string | null }>(
    "SELECT estado,huella_peticion FROM cne.puesto_movil_actividad WHERE id=$1", [turno.id]);
  if (actividad?.estado === "aceptado" && actividad.huella_peticion === huella) return { aceptado: true };
  if (actividad?.estado !== "pendiente") fallo(409, "Ya se solicitó el envío. Revise la bandeja de entrada.");

  if (!elector) {
    exigirPadron();
    if (!await guardarContactoAusente(turno.id, turno.vence, nombre, turno.cedula, correo)) {
      fallo(409, "Actualice la consulta antes de enviar.");
    }
  }

  const { proveedor, remitente, habilitado } = await correoElectoral();
  if (!habilitado) fallo(503, "El correo del puesto aún no está habilitado.");
  let pdf: Uint8Array;
  let guia: Buffer | null = null;
  try {
    pdf = await prepararDocumentoLaboral(readFileSync(join(recursos, "base-justificante-laboral.pdf")),
      readFileSync(join(recursos, "noto-serif-bold.ttf")), { nombre, cedula: turno.cedula, documento });
  } catch { fallo(422, "No se pudo generar el justificante con ese nombre. Consulte al personal consular."); }
  if (turno.tipo === "sin") guia = readFileSync(join(process.cwd(), "public/guia-electoral.pdf"));

  exigirPadron();
  if (Date.now() >= turno.vence) fallo(409, "La consulta ha caducado. Vuelva a buscar la cédula.");
  const [reserva] = await query<{ id: string }>(`
    UPDATE cne.puesto_movil_actividad SET estado='enviando',envio_iniciado=now(),huella_peticion=$2
    WHERE id=$1 AND estado='pendiente' RETURNING id`, [turno.id, huella]);
  if (!reserva) fallo(409, "Ya se solicitó el envío o la consulta se agotó. Revise la bandeja de entrada.");
  try { exigirPadron(); }
  catch (error) { await cambiarEstado(turno.id, "pendiente"); throw error; }

  let resultado;
  try {
    resultado = await proveedor.enviar({
      para: correo, asunto: "Justificante laboral e información electoral", remitente: {
        nombre: remitente.nombre || "Consulado General del Ecuador en Madrid", direccion: remitente.direccion,
      },
      texto: "Adjuntamos el justificante laboral solicitado en el puesto de información electoral.\n\n" + informacion(turno.tipo, elector),
      adjunto: { nombre: "justificante-laboral.pdf", base64: Buffer.from(pdf).toString("base64") },
      ...(guia ? { adjuntos: [{ nombre: "guia-electoral.pdf", base64: guia.toString("base64") }] } : {}),
    });
  } catch {
    await cambiarEstado(turno.id, "incierto");
    fallo(503, "El proveedor no confirmó el envío. Revise su bandeja de entrada.");
  }
  await cambiarEstado(turno.id, resultado.ok ? "aceptado" : resultado.incierto ? "incierto" : "pendiente");
  if (!resultado.ok) fallo(503, resultado.incierto ? "El proveedor no confirmó el envío. Revise su bandeja de entrada." : "El correo no se envió. Verifique la dirección y vuelva a intentarlo.");
  return { aceptado: true };
}

export async function seguimiento() {
  const [cifras] = await query<{ consultas: number; con: number; sin: number; correosAceptados: number; correosInciertos: number }>(`
    SELECT count(*) AS consultas, count(*) FILTER (WHERE tipo='con') AS con,
      count(*) FILTER (WHERE tipo='sin') AS sin, count(*) FILTER (WHERE estado='aceptado') AS "correosAceptados",
      count(*) FILTER (WHERE estado='incierto' OR (estado='enviando' AND envio_iniciado<now()-interval '1 minute')) AS "correosInciertos"
    FROM cne.puesto_movil_actividad`);
  return cifras;
}
