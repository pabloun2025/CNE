import type { Serie } from "../../domain/juntas";
import { pedirJson, type FetchLike } from "./http";

const URL_ENVIO = "https://api.gateway360.com/api/3.0/sms/send-link";
const LONGITUD_ENLACE_CORTO = 18;
const MAX_SEGMENTO_GSM7 = 160;

export const remitenteSmsMadrid = (serie: Serie): string => serie === "M" ? "+34679381651" : "+34615273435";

export function mensajeSmsMadrid(nombres: string):
  | { ok: true; texto: string; longitud: number }
  | { ok: false; motivo: "nombre_invalido" | "nombre_largo" } {
  const [primero] = nombres.trim().split(/\s+/u, 1);
  const nombre = primero.normalize("NFD").replace(/\p{M}/gu, "");
  if (!/^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(nombre)) return { ok: false, motivo: "nombre_invalido" };
  const convocatoria = `${nombre}, le esperamos el 29/11 a las 08:00 en la Caja Magica para las elecciones de Ecuador. Presente el QR de su credencial:\n`;
  // El texto fijo y el alfabeto admitido del nombre usan un septeto por carácter.
  const longitud = convocatoria.length + LONGITUD_ENLACE_CORTO;
  if (longitud > MAX_SEGMENTO_GSM7) return { ok: false, motivo: "nombre_largo" };
  return { ok: true, texto: `${convocatoria}{LINK}`, longitud };
}

type MensajeSmsPubli = { id: number; destino: string; remitente: string; texto: string; enlace: string; acuse: string };
export type ResultadoSmsPubli =
  | { estado: "aceptado"; idExterno: string }
  | { estado: "fallo" | "incierto"; codigo: string };

const sinRedireccion: FetchLike = (url, init) => fetch(url, { ...init, redirect: "error" });

export async function enviarSmsPubli(mensaje: MensajeSmsPubli, opciones: { apiKey: string; fetch?: FetchLike }): Promise<ResultadoSmsPubli> {
  const raw = await pedirJson(opciones.fetch ?? sinRedireccion, URL_ENVIO, {
    method: "POST", timeoutMs: 15_000,
    body: {
      api_key: opciones.apiKey,
      link: mensaje.enlace,
      report_url: mensaje.acuse,
      encoding: "GSM7",
      concat: 0,
      messages: [{ from: mensaje.remitente, to: mensaje.destino.slice(1), text: mensaje.texto, custom: `CNESMS${mensaje.id}` }],
    },
  });
  if (raw.kind === "network") {
    return raw.sent === "no" ? { estado: "fallo", codigo: "SIN_CONEXION" } : { estado: "incierto", codigo: "RESPUESTA_INCIERTA" };
  }
  if (raw.status < 200 || raw.status >= 300) {
    const rechazo = raw.status >= 400 && raw.status < 500 && raw.status !== 408 && raw.status !== 409;
    return { estado: rechazo ? "fallo" : "incierto", codigo: `HTTP_${raw.status}` };
  }
  const json = raw.json as { status?: unknown; error_id?: unknown; result?: unknown } | null;
  const resultado = Array.isArray(json?.result) && json.result.length === 1 ? json.result[0] : null;
  const idExterno = resultado?.sms_id;
  if (json?.status === "ok" && resultado?.status === "ok" && typeof idExterno === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(idExterno)) {
    return { estado: "aceptado", idExterno };
  }
  if ((json?.status === "error" || resultado?.status === "error") && resultado?.status !== "ok" && !idExterno) {
    const codigo = resultado?.error_id ?? json?.error_id;
    return { estado: "fallo", codigo: typeof codigo === "string" && /^[A-Z0-9_]{1,60}$/.test(codigo) ? codigo : "RECHAZADO" };
  }
  return { estado: "incierto", codigo: "RESPUESTA_INCIERTA" };
}
