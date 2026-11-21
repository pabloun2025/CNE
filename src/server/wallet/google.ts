import { createHash, createHmac, createSign, timingSafeEqual } from "node:crypto";

// Google Wallet para la credencial de MJRV (solo Android). Adaptado de teinvito: el pase se firma con la cuenta de servicio
// (RS256) y se entrega como enlace «Guardar en Google Wallet». Sin las tres variables no hay configuración y todo queda oculto.
export type ConfigWallet = { issuerId: string; email: string; privateKey: string };
export type FichaWallet = { id: number; cedula: string; apellidos: string; nombres: string; cargo: string; rotulo: string };
export type Peticion = (url: string, init?: RequestInit) => Promise<Response>;

export function configWallet(env: Record<string, string | undefined> = process.env): ConfigWallet | null {
  const issuerId = env.GOOGLE_WALLET_ISSUER_ID?.trim(), email = env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL?.trim(), clave = env.GOOGLE_WALLET_PRIVATE_KEY?.trim();
  if (!issuerId || !/^\d+$/.test(issuerId) || !email || !clave) return null;
  return { issuerId, email, privateKey: clave.replace(/\\n/g, "\n") };
}

// Versión del diseño: Google no actualiza una clase u objeto ya guardado, así que un diseño nuevo usa ids nuevos.
export const CLASE_WALLET = "cne_madrid_mjrv_2026_v1";
export const claseId = (c: ConfigWallet) => `${c.issuerId}.${CLASE_WALLET}`;
const COLOR_FONDO = "#12325a";
const b64 = (x: unknown) => Buffer.from(JSON.stringify(x)).toString("base64url");
const texto = (value: string) => ({ defaultValue: { language: "es-ES", value } });

function firmarJwt(clave: string, cabecera: object, cuerpo: object): string {
  const datos = `${b64(cabecera)}.${b64(cuerpo)}`;
  return `${datos}.${createSign("RSA-SHA256").update(datos).sign(clave).toString("base64url")}`;
}

// Token del enlace público: id interno + firma HMAC con la clave maestra. No lleva la cédula y no se adivina.
const firma = (id: number, secreto: string) => createHmac("sha256", secreto).update(`wallet-mjrv:${id}`).digest("base64url").slice(0, 32);
export const tokenWallet = (id: number, secreto: string) => `${id}.${firma(id, secreto)}`;
export function leerTokenWallet(token: string, secreto: string): number | null {
  const m = /^([1-9]\d{0,15})\.([A-Za-z0-9_-]{32})$/.exec(token);
  if (!m) return null;
  const esperada = Buffer.from(firma(Number(m[1]), secreto)), recibida = Buffer.from(m[2]);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida) ? Number(m[1]) : null;
}

// Id del objeto: un hash de la clave maestra y el id interno; sin datos personales.
const objetoId = (c: ConfigWallet, id: number, secreto: string) =>
  `${c.issuerId}.mjrv_${createHash("sha256").update(`obj:${id}:${secreto}`).digest("hex").slice(0, 24)}`;

export function objetoWallet(c: ConfigWallet, f: FichaWallet, secreto: string) {
  return {
    id: objetoId(c, f.id, secreto),
    classId: claseId(c),
    state: "ACTIVE",
    hexBackgroundColor: COLOR_FONDO,
    cardTitle: texto("Miembro de Junta Receptora del Voto"),
    subheader: texto(f.rotulo),
    header: texto(`${f.apellidos} ${f.nombres}`),
    // Mismo contenido que el QR de la credencial impresa: la cédula.
    barcode: { type: "QR_CODE", value: f.cedula, alternateText: f.cedula },
    textModulesData: [
      { id: "cargo", header: "Cargo", body: f.cargo },
      { id: "cedula", header: "Cédula", body: f.cedula },
      { id: "jornada", header: "Jornada", body: "Domingo 29 de noviembre de 2026 · Caja Mágica, nivel −2" },
    ],
  };
}

// Enlace de guardado. Si Google aún no confirmó la clase, se incluye en el propio JWT para que se cree al guardar.
export function urlGuardar(c: ConfigWallet, f: FichaWallet, secreto: string, opciones: { claseEnJwt?: boolean; ahora?: Date } = {}): string {
  const payload = { genericObjects: [objetoWallet(c, f, secreto)], ...(opciones.claseEnJwt ? { genericClasses: [{ id: claseId(c) }] } : {}) };
  const jwt = firmarJwt(c.privateKey, { alg: "RS256", typ: "JWT" }, {
    iss: c.email, aud: "google", typ: "savetowallet", iat: Math.floor((opciones.ahora ?? new Date()).getTime() / 1000), origins: [], payload,
  });
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

const API = "https://walletobjects.googleapis.com/walletobjects/v1/genericClass";
let claseVerificada: string | null = null;
export const olvidarClaseVerificada = () => { claseVerificada = null; };

// Crea o verifica la clase de forma idempotente. Nunca lanza: devuelve false y se reintenta en el próximo uso.
export async function asegurarClase(c: ConfigWallet, peticion: Peticion = fetch): Promise<boolean> {
  const clase = claseId(c);
  if (claseVerificada === clase) return true;
  try {
    const ahora = Math.floor(Date.now() / 1000), url = "https://oauth2.googleapis.com/token";
    const assertion = firmarJwt(c.privateKey, { alg: "RS256", typ: "JWT" }, { iss: c.email, aud: url, scope: "https://www.googleapis.com/auth/wallet_object.issuer", iat: ahora, exp: ahora + 300 });
    const t = await peticion(url, { method: "POST", body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), signal: AbortSignal.timeout(15000) });
    if (!t.ok) return false;
    const accessToken = ((await t.json()) as { access_token?: unknown }).access_token;
    if (typeof accessToken !== "string") return false;
    const headers = { authorization: `Bearer ${accessToken}`, "content-type": "application/json" };
    const leer = () => peticion(`${API}/${encodeURIComponent(clase)}`, { headers, signal: AbortSignal.timeout(15000) });
    let r = await leer();
    if (r.status === 404) {
      const creada = await peticion(API, { method: "POST", headers, body: JSON.stringify({ id: clase }), signal: AbortSignal.timeout(15000) });
      if (!creada.ok && creada.status !== 409) return false;
      r = await leer();
    }
    if (!r.ok) return false;
    claseVerificada = clase;
    return true;
  } catch {
    return false;
  }
}

// Enlace público que va en los mensajes. Sin configuración o sin host no hay enlace.
export function enlaceWallet(id: number, host: string | null | undefined, env: Record<string, string | undefined> = process.env, secreto = env.APP_MASTER_KEY ?? ""): string | null {
  const dominio = (host ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!configWallet(env) || !dominio || !secreto) return null;
  return `https://${dominio}/w/${tokenWallet(id, secreto)}`;
}
