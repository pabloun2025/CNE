import { createHmac, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { validarMovil } from "../../domain/ingreso";
import { juntaEnCredencial, type Serie } from "../../domain/juntas";
import { registrarAuditoria } from "../auditoria";
import type { Sesion } from "../auth";
import { leerModo } from "../config";
import { tokenCredencialSms } from "../credencial-sms";
import { masterKey } from "../crypto";
import { query, withTx } from "../db";
import { loadEnv } from "../env";
import type { FetchLike } from "./http";
import { enviarSmsPubli, mensajeSmsMadrid, remitenteSmsMadrid, type ResultadoSmsPubli } from "./sms-publi";
import { hashEnlaceSms, urlAcuseSms } from "./sms-seguimiento";

export const MAX_SELECCION_SMS = 5;
const EXPIRA = Date.parse("2026-11-29T23:59:00+01:00");
const VIGENCIA_REVISION = 10 * 60_000;
const SELECCION_CAMBIO = "La selección o su revisión dejó de ser válida. Vuelva a revisar las fichas disponibles.";

type FilaSms = {
  id: number; cedula: string; nombres: string; apellidos: string; telefono: string;
  serie: Serie; numero: number; rol: string;
};
type FichaSms = FilaSms & { texto: string; remitente: string };
export type DestinatarioSms = { id: number; nombre: string; junta: string; movil: string };
export type VistaEnviosSms = { confirmacion: string; destinatarios: (DestinatarioSms & { texto: string; remitente: string })[] };
type EstadoIntento = "aceptado" | "entregado" | "fallo" | "incierto";
type ResultadoEnviosSms = Record<EstadoIntento | "pendientes", number>;

// La secretaría de F23 figura vacante en el Excel oficial del 26/11.
const BUSCAR_FICHAS = `
  SELECT m.id, m.cedula, m.nombres, m.apellidos, m.telefono_e164 AS telefono, j.serie, j.numero, m.rol
  FROM cne.mjrv m JOIN cne.juntas_madrid j ON j.id = m.junta_origen_id
  WHERE ($1::bigint[] IS NULL OR m.id = ANY($1))
    AND m.activo AND NOT m.es_prueba AND m.incorporado_en IS NULL AND NOT cne.en_prueba()
    AND NOT (j.serie = 'M' AND j.numero = 23 AND m.rol = 'secretario')
    AND m.telefono_e164 ~ '^[+][1-9][0-9]{7,14}$'
    AND NOT EXISTS (SELECT 1 FROM cne.credenciales_revocadas r WHERE r.mjrv_id = m.id OR r.cedula = m.cedula)
    AND NOT EXISTS (SELECT 1 FROM cne.envios_sms e WHERE e.mjrv_id = m.id)
    AND NOT EXISTS (SELECT 1 FROM cne.mjrv otro WHERE otro.id <> m.id AND otro.activo AND NOT otro.es_prueba AND otro.telefono_e164 = m.telefono_e164)
  ORDER BY m.id`;

function prepararFicha(fila: FilaSms): FichaSms | null {
  const movil = validarMovil(fila.telefono);
  const mensaje = mensajeSmsMadrid(fila.nombres);
  if (!movil.ok || movil.telefono !== fila.telefono || !mensaje.ok) return null;
  return { ...fila, texto: mensaje.texto, remitente: remitenteSmsMadrid(fila.serie) };
}

async function leerFichas(ids: number[] | null) {
  return (await query<FilaSms>(BUSCAR_FICHAS, [ids])).map(prepararFicha).filter((ficha) => ficha !== null);
}

function destinatario(ficha: FichaSms): DestinatarioSms {
  return { id: ficha.id, nombre: `${ficha.apellidos}, ${ficha.nombres}`, junta: juntaEnCredencial(ficha.serie, ficha.numero), movil: ficha.telefono };
}

function configuracion() {
  loadEnv();
  const apiKey = process.env.SMSPUBLI_API?.trim();
  const host = process.env.HOST_MADRID?.trim();
  return apiKey && host && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host) ? { apiKey, host } : null;
}

export async function bloqueoEnviosSms(): Promise<string | null> {
  if (await leerModo() !== "eleccion") return "Los envíos por SMS solo están disponibles en modo elección.";
  if (Date.now() >= EXPIRA) return "El plazo de envío de esta convocatoria ha terminado.";
  if (!configuracion()) return "SMS Publi no está configurado en este entorno.";
  return null;
}

export async function listarDestinatariosSms(): Promise<DestinatarioSms[]> {
  return (await leerFichas(null)).map(destinatario).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

function seleccionValida(ids: number[]) {
  return ids.length > 0 && ids.length <= MAX_SELECCION_SMS && new Set(ids).size === ids.length && ids.every((id) => Number.isSafeInteger(id) && id > 0);
}

function firmarRevision(sesion: Sesion, vence: number, fichas: FichaSms[]) {
  return createHmac("sha256", masterKey()).update(JSON.stringify(["cne/madrid/sms/confirmacion/v1", sesion.sesionId, vence, fichas])).digest("base64url");
}

export async function prepararEnviosSms(sesion: Sesion, ids: number[]): Promise<VistaEnviosSms | { error: string }> {
  if (!seleccionValida(ids)) return { error: `Seleccione entre 1 y ${MAX_SELECCION_SMS} fichas.` };
  const bloqueo = await bloqueoEnviosSms();
  if (bloqueo) return { error: bloqueo };
  const fichas = await leerFichas(ids);
  if (fichas.length !== ids.length) return { error: SELECCION_CAMBIO };
  const vence = Math.min(Date.now() + VIGENCIA_REVISION, EXPIRA);
  return {
    confirmacion: `${vence}.${firmarRevision(sesion, vence, fichas)}`,
    destinatarios: fichas.map((ficha) => ({ ...destinatario(ficha), remitente: ficha.remitente, texto: ficha.texto.replace("{LINK}", "[enlace al QR]") })),
  };
}

async function bloquearModoEleccion(client: PoolClient): Promise<boolean> {
  await client.query("SET LOCAL lock_timeout = '1s'");
  // El cambio de modo toma FOR UPDATE. KEY SHARE deja continuar otros ajustes.
  const modo = await client.query("SELECT 1 FROM cne.configuracion WHERE id = 1 AND modo = 'eleccion' FOR KEY SHARE");
  return modo.rowCount === 1;
}

async function reservar(sesion: Sesion, ficha: FichaSms, token: string): Promise<number | null> {
  return withTx(async (client) => {
    if (!await bloquearModoEleccion(client)) return null;
    // Se comprueba la ficha en una consulta posterior al bloqueo para detectar reservas o cambios concurrentes.
    const bloqueada = await client.query("SELECT 1 FROM cne.mjrv WHERE id = $1 FOR NO KEY UPDATE", [ficha.id]);
    if (!bloqueada.rowCount) return null;
    const [fila] = (await client.query<FilaSms>(BUSCAR_FICHAS, [[ficha.id]])).rows;
    if (!fila || JSON.stringify(prepararFicha(fila)) !== JSON.stringify(ficha) || Date.now() >= EXPIRA) return null;
    const [envio] = (await client.query<{ id: number }>(
      `INSERT INTO cne.envios_sms (mjrv_id, destino, remitente, token_hash)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id`,
      [ficha.id, ficha.telefono, ficha.remitente, hashEnlaceSms(token)],
    )).rows;
    if (!envio) return null;
    await registrarAuditoria({ portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre,
      accion: "sms_credencial_reservado", entidad: "envios_sms", entidadId: envio.id, datos: { mjrv_id: ficha.id } }, client);
    return envio.id;
  });
}

async function enviarReservado(id: number, ficha: FichaSms, token: string, { apiKey, host }: NonNullable<ReturnType<typeof configuracion>>, fetch?: FetchLike): Promise<EstadoIntento> {
  return withTx(async (client) => {
    const enEleccion = await bloquearModoEleccion(client);
    const dentroDelPlazo = Date.now() < EXPIRA;
    // El modo permanece en elección mientras arranca y termina la solicitud acotada al proveedor.
    const envio: ResultadoSmsPubli = enEleccion && dentroDelPlazo
      ? await enviarSmsPubli({ id, destino: ficha.telefono, remitente: ficha.remitente, texto: ficha.texto,
        enlace: `https://${host}/s/${token}`, acuse: urlAcuseSms(host, id) }, { apiKey, fetch })
      : { estado: "fallo", codigo: enEleccion ? "FUERA_DE_PLAZO" : "FUERA_DE_MODO_ELECCION" };
    // Si el proveedor notificó la entrega primero, su acuse tiene prioridad.
    const [fila] = (await client.query<{ estado: EstadoIntento }>(
      `UPDATE cne.envios_sms SET
          estado = CASE WHEN estado = 'reservado' THEN $2 ELSE estado END,
          codigo_error = CASE WHEN estado = 'reservado' THEN $3 ELSE codigo_error END,
          id_externo = coalesce(id_externo, $4), actualizado_en = now()
        WHERE id = $1 AND ($4::text IS NULL OR id_externo IS NULL OR id_externo = $4)
        RETURNING estado`,
      [id, envio.estado, envio.estado === "aceptado" ? null : envio.codigo, envio.estado === "aceptado" ? envio.idExterno : null],
    )).rows;
    return fila?.estado ?? "incierto";
  });
}

export async function confirmarEnviosSms(sesion: Sesion, ids: number[], confirmacion: string, fetch?: FetchLike): Promise<ResultadoEnviosSms | { error: string }> {
  const formato = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(confirmacion);
  if (!formato || !seleccionValida(ids) || Date.now() >= Number(formato[1])) return { error: SELECCION_CAMBIO };
  const cfg = configuracion();
  if (!cfg) return { error: "SMS Publi no está configurado en este entorno." };
  const fichas = await leerFichas(ids);
  if (fichas.length !== ids.length || !timingSafeEqual(Buffer.from(formato[2]), Buffer.from(firmarRevision(sesion, Number(formato[1]), fichas)))) {
    return { error: SELECCION_CAMBIO };
  }

  const resultado: ResultadoEnviosSms = { aceptado: 0, entregado: 0, fallo: 0, incierto: 0, pendientes: fichas.length };
  for (const ficha of fichas) {
    const token = tokenCredencialSms(ficha, EXPIRA);
    const id = await reservar(sesion, ficha, token).catch(() => null);
    if (id === null) break;
    resultado.pendientes--;
    // La reserva se confirma antes de contactar al proveedor. Un resultado incierto conserva la reserva.
    const estado = await enviarReservado(id, ficha, token, cfg, fetch).catch((): EstadoIntento => "incierto");
    resultado[estado]++;
    if (estado === "incierto" || estado === "fallo") break;
  }
  return resultado;
}
