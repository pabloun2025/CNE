import QRCode from "qrcode";
import { loadEnv } from "../env";
import { pedirJson, type FetchLike, type Raw, type ResultadoProveedor } from "./http";

// Cliente reducido de la Evolution API v2.3.7 de consulares (copia adaptada de consulares/src/domain/evolution.ts y de
// teinvito/src/server/whatsapp.ts). La clave global de esa API abre TAMBIÉN las instancias de consulares: por eso CNE
// solo habla con su instancia fija y ningún método recibe otro nombre. Una prueba lo exige.
export const INSTANCIA_CNE = "cne-madrid";

export type EstadoConexion = "unknown" | "connecting" | "open" | "close" | "error";
export type CodigoVinculo = { estado: EstadoConexion; qr: string | null };
export type ResumenInstancia = { estado: EstadoConexion; numero: string | null; existe: boolean };
export type Documento = { numero: string; texto: string; nombreArchivo: string; pdfBase64: string };

export interface ClienteEvolution {
  readonly simulado: boolean;
  crearInstancia(): Promise<void>;
  conectar(): Promise<CodigoVinculo>;
  resumen(): Promise<ResumenInstancia>;
  cerrarSesion(): Promise<void>;
  enviarDocumento(d: Documento): Promise<ResultadoProveedor>;
}

export class ErrorEvolution extends Error {}

const aEstado = (v: unknown): EstadoConexion => (v === "open" || v === "connecting" || v === "close" ? v : v === "refused" ? "error" : "unknown");

export function numeroDeJid(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const digitos = v.split("@")[0]?.split(":")[0] ?? "";
  return /^\d{8,15}$/.test(digitos) ? `+${digitos}` : null;
}

function mensajeDeError(json: unknown): string | null {
  const r = (json as { response?: { message?: unknown } } | null)?.response;
  const m = Array.isArray(r?.message) ? r.message[0] : r?.message;
  return typeof m === "string" ? m.slice(0, 200) : null;
}

export function resultadoDeEnvio(raw: Raw): ResultadoProveedor {
  if (raw.kind === "network") {
    return raw.sent === "no"
      ? { ok: false, permanente: false, error: "No se pudo conectar con Evolution API. El mensaje no salió." }
      : { ok: false, permanente: false, incierto: true, error: "Evolution API no respondió a tiempo. El mensaje pudo haber salido." };
  }
  if (raw.status >= 200 && raw.status < 300) {
    const id = (raw.json as { key?: { id?: unknown } } | null)?.key?.id;
    if (typeof id === "string" && id.length > 0 && id.length <= 128) return { ok: true, idExterno: id };
    return { ok: false, permanente: false, incierto: true, error: "Evolution API aceptó la petición sin devolver identificador." };
  }
  if (raw.status === 400) {
    if (/"exists"\s*:\s*false/.test(JSON.stringify(raw.json ?? ""))) return { ok: false, permanente: true, error: "El número no tiene WhatsApp." };
    return { ok: false, permanente: true, error: "Evolution API rechazó el mensaje." };
  }
  if (raw.status === 401 || raw.status === 403) return { ok: false, permanente: false, error: "Evolution API rechazó la credencial. El mensaje no salió." };
  if (raw.status === 404) return { ok: false, permanente: false, error: "La línea de WhatsApp de CNE no existe en Evolution API. El mensaje no salió." };
  return { ok: false, permanente: false, incierto: true, error: `Evolution API respondió ${raw.status}. El mensaje pudo haber salido.` };
}

export class EvolutionHttp implements ClienteEvolution {
  readonly simulado = false;
  private readonly base: string;
  constructor(private readonly opciones: { baseUrl: string; apiKey: string; timeoutMs?: number; fetch?: FetchLike }) {
    this.base = opciones.baseUrl.replace(/\/$/, "");
  }

  private pedir(method: string, ruta: string, body?: unknown, timeoutMs = this.opciones.timeoutMs ?? 15000): Promise<Raw> {
    return pedirJson(this.opciones.fetch, `${this.base}${ruta}`, { method, headers: { apikey: this.opciones.apiKey }, body, timeoutMs });
  }

  private async esperarOk(method: string, ruta: string, body?: unknown): Promise<unknown> {
    const raw = await this.pedir(method, ruta, body);
    if (raw.kind === "network") throw new ErrorEvolution(`Evolution API no responde (${raw.error}).`);
    if (raw.status < 200 || raw.status >= 300) throw new ErrorEvolution(mensajeDeError(raw.json) ?? `Evolution API respondió ${raw.status}.`);
    return raw.json;
  }

  // Sin webhook: CNE no recibe mensajes ni estados (nunca se afirma «entregada»).
  async crearInstancia(): Promise<void> {
    await this.esperarOk("POST", "/instance/create", {
      instanceName: INSTANCIA_CNE, integration: "WHATSAPP-BAILEYS", qrcode: false, groupsIgnore: true, alwaysOnline: false,
      readMessages: false, readStatus: false, syncFullHistory: false, rejectCall: false,
    });
  }

  async conectar(): Promise<CodigoVinculo> {
    const json = (await this.esperarOk("GET", `/instance/connect/${INSTANCIA_CNE}`)) as Record<string, unknown> | null;
    const anidado = json?.instance as { state?: unknown; status?: unknown } | undefined;
    if (anidado && (anidado.state === "open" || anidado.status === "open")) return { estado: "open", qr: null };
    const base64 = typeof json?.base64 === "string" ? json.base64 : null;
    return { estado: "connecting", qr: base64 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(base64) ? base64 : null };
  }

  async resumen(): Promise<ResumenInstancia> {
    const raw = await this.pedir("GET", `/instance/connectionState/${INSTANCIA_CNE}`);
    if (raw.kind === "network") throw new ErrorEvolution(`Evolution API no responde (${raw.error}).`);
    if (raw.status === 404) return { estado: "unknown", numero: null, existe: false };
    if (raw.status < 200 || raw.status >= 300) throw new ErrorEvolution(mensajeDeError(raw.json) ?? `Evolution API respondió ${raw.status}.`);
    const estado = aEstado((raw.json as { instance?: { state?: unknown } } | null)?.instance?.state);
    const lista = await this.pedir("GET", `/instance/fetchInstances?instanceName=${INSTANCIA_CNE}`);
    let numero: string | null = null;
    if (lista.kind === "response" && Array.isArray(lista.json)) {
      numero = numeroDeJid((lista.json as Array<{ name?: unknown; ownerJid?: unknown }>).find((i) => i?.name === INSTANCIA_CNE)?.ownerJid);
    }
    return { estado, numero, existe: true };
  }

  async cerrarSesion(): Promise<void> {
    const raw = await this.pedir("DELETE", `/instance/logout/${INSTANCIA_CNE}`);
    if (raw.kind === "network") throw new ErrorEvolution(`Evolution API no responde (${raw.error}).`);
    // 400 «not connected»: ya estaba desvinculada.
    if (raw.status >= 300 && raw.status !== 400) throw new ErrorEvolution(mensajeDeError(raw.json) ?? `Evolution API respondió ${raw.status}.`);
  }

  // PDF en base64 con el texto como pie (teinvito: evolutionMediaRequest). Sin «delay»: el ritmo lo marca la cola.
  async enviarDocumento(d: Documento): Promise<ResultadoProveedor> {
    const raw = await this.pedir("POST", `/message/sendMedia/${INSTANCIA_CNE}`, {
      number: d.numero.replace(/^\+/, ""), mediatype: "document", mimetype: "application/pdf", caption: d.texto, media: d.pdfBase64, fileName: d.nombreArchivo,
    }, 60000);
    return resultadoDeEnvio(raw);
  }
}

// Para local y pruebas: imita la vinculación y no envía nada. El estado es del proceso.
export class EvolutionSimulado implements ClienteEvolution {
  readonly simulado = true;
  private static estado: { existe: boolean; estado: EstadoConexion; numero: string | null } = { existe: false, estado: "unknown", numero: null };
  static reiniciar(): void { EvolutionSimulado.estado = { existe: false, estado: "unknown", numero: null }; }
  // Equivale a escanear el código con el teléfono.
  static completarVinculo(numero = "+34000000000"): void { EvolutionSimulado.estado = { existe: true, estado: "open", numero }; }

  async crearInstancia(): Promise<void> {
    if (!EvolutionSimulado.estado.existe) EvolutionSimulado.estado = { existe: true, estado: "close", numero: null };
  }
  async conectar(): Promise<CodigoVinculo> {
    if (EvolutionSimulado.estado.estado === "open") return { estado: "open", qr: null };
    EvolutionSimulado.estado = { ...EvolutionSimulado.estado, existe: true, estado: "connecting" };
    return { estado: "connecting", qr: await QRCode.toDataURL(`SIMULACION ${INSTANCIA_CNE}: este código no vincula ninguna cuenta.`, { margin: 2, width: 264 }) };
  }
  async resumen(): Promise<ResumenInstancia> { return { ...EvolutionSimulado.estado }; }
  async cerrarSesion(): Promise<void> {
    if (EvolutionSimulado.estado.existe) EvolutionSimulado.estado = { existe: true, estado: "close", numero: null };
  }
  async enviarDocumento(): Promise<ResultadoProveedor> {
    if (EvolutionSimulado.estado.estado !== "open") return { ok: false, permanente: false, error: "La línea simulada no está vinculada. El mensaje no salió." };
    return { ok: true, idExterno: `SIMULADO-wa-${Date.now().toString(36)}` };
  }
}

// EVOLUTION_API_URL vacía o «simulado», o sin clave → cliente simulado (como consulares). Nada sale de la aplicación.
export function clienteEvolution(opciones: { fetch?: FetchLike } = {}): ClienteEvolution {
  loadEnv();
  const url = (process.env.EVOLUTION_API_URL ?? "").trim();
  const clave = (process.env.EVOLUTION_API_KEY ?? "").trim();
  if (!url || url === "simulado" || !clave) return new EvolutionSimulado();
  return new EvolutionHttp({ baseUrl: url, apiKey: clave, fetch: opciones.fetch });
}

export const hayClaveWhatsApp = (): boolean => !clienteEvolution().simulado;
