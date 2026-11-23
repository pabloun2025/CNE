import QRCode from "qrcode";
import type { LineaEnvioWhatsApp } from "../../domain/envios-ritmo";
import { loadEnv } from "../env";
import { pedirJson, type FetchLike, type Raw, type ResultadoProveedor } from "./http";

// Cliente reducido de la Evolution API v2.3.7 de consulares (copia adaptada de consulares/src/domain/evolution.ts y de
// teinvito/src/server/whatsapp.ts). La clave global de esa API abre TAMBIÉN las instancias de consulares: por eso CNE
// solo habla con sus dos instancias fijas y ningún método recibe un nombre de instancia.
export const INSTANCIA_CNE = "cne-madrid";

export function instanciaWhatsApp(linea: LineaEnvioWhatsApp): string {
  if (linea === 1) return INSTANCIA_CNE;
  if (linea === 2) return "cne-madrid-2";
  throw new ErrorEvolution("Línea de WhatsApp no válida.");
}

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
  const cuerpo = json as { response?: { message?: unknown }; message?: unknown } | null;
  const anidado = cuerpo?.response?.message;
  const m = Array.isArray(anidado) ? anidado[0] : anidado ?? cuerpo?.message;
  return typeof m === "string" ? m.slice(0, 200) : null;
}

// Evolution a veces manda el PNG como data URL y a veces como base64 pelado.
function qrDataUrl(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.replace(/\s/g, "");
  if (/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(limpio)) return limpio;
  if (/^[A-Za-z0-9+/=]+$/.test(limpio) && limpio.length > 80) return `data:image/png;base64,${limpio}`;
  return null;
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
  private readonly instancia: string;
  constructor(private readonly opciones: { baseUrl: string; apiKey: string; timeoutMs?: number; fetch?: FetchLike; linea?: LineaEnvioWhatsApp }) {
    this.base = opciones.baseUrl.replace(/\/$/, "");
    this.instancia = instanciaWhatsApp(opciones.linea ?? 1);
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
  // 403/409 «already in use»: la instancia ya está; se sigue con el código. Un 400 de validación sí aborta.
  async crearInstancia(): Promise<void> {
    const raw = await this.pedir("POST", "/instance/create", {
      instanceName: this.instancia, integration: "WHATSAPP-BAILEYS", qrcode: false, groupsIgnore: true, alwaysOnline: false,
      readMessages: false, readStatus: false, syncFullHistory: false, rejectCall: false,
    });
    if (raw.kind === "network") throw new ErrorEvolution(`Evolution API no responde (${raw.error}).`);
    if (raw.status >= 200 && raw.status < 300) return;
    const msg = mensajeDeError(raw.json) ?? "";
    if ((raw.status === 403 || raw.status === 409) && /already in use|already exists|unique constraint|duplicate key/i.test(msg)) return;
    throw new ErrorEvolution(msg || `Evolution API respondió ${raw.status}.`);
  }

  async conectar(): Promise<CodigoVinculo> {
    const json = (await this.esperarOk("GET", `/instance/connect/${this.instancia}`)) as Record<string, unknown> | null;
    // Evolution 2.3.7 responde 200 con { error: true } si la instancia no está cargada. No es un código en blanco.
    if (json?.error === true) {
      const msg = typeof json.message === "string" ? json.message.replace(/^BadRequestException:\s*/, "") : "";
      throw new ErrorEvolution((msg || "Evolution API no preparó el código de vinculación.").slice(0, 200));
    }
    const anidado = json?.instance as { state?: unknown; status?: unknown } | undefined;
    if (anidado && (anidado.state === "open" || anidado.status === "open")) return { estado: "open", qr: null };
    const anidadoQr = json?.qrcode as { base64?: unknown; code?: unknown } | undefined;
    const dibujado = qrDataUrl(json?.base64) ?? qrDataUrl(anidadoQr?.base64);
    if (dibujado) return { estado: "connecting", qr: dibujado };
    const codigo = typeof json?.code === "string" ? json.code : typeof anidadoQr?.code === "string" ? anidadoQr.code : null;
    if (codigo && codigo.length > 8) return { estado: "connecting", qr: await QRCode.toDataURL(codigo, { margin: 2, width: 264 }) };
    return { estado: "connecting", qr: null };
  }

  async resumen(): Promise<ResumenInstancia> {
    const raw = await this.pedir("GET", `/instance/connectionState/${this.instancia}`);
    if (raw.kind === "network") throw new ErrorEvolution(`Evolution API no responde (${raw.error}).`);
    if (raw.status === 404) return { estado: "unknown", numero: null, existe: false };
    if (raw.status < 200 || raw.status >= 300) throw new ErrorEvolution(mensajeDeError(raw.json) ?? `Evolution API respondió ${raw.status}.`);
    let estado = aEstado((raw.json as { instance?: { state?: unknown } } | null)?.instance?.state);
    const lista = await this.pedir("GET", `/instance/fetchInstances?instanceName=${this.instancia}`);
    if (lista.kind === "network") {
      if (estado === "unknown") throw new ErrorEvolution(`Evolution API no responde (${lista.error}).`);
      return { estado, numero: null, existe: true };
    }
    // Evolution 2.3.7: connectionState es 200 aunque la instancia no esté en memoria (state ausente).
    // fetchInstances responde 404 en ese caso. Sin esa señal, «Crear y vincular» nunca llama a /instance/create.
    if (lista.status === 404) return { estado: "unknown", numero: null, existe: false };
    if (lista.status < 200 || lista.status >= 300) {
      if (estado === "unknown") throw new ErrorEvolution(mensajeDeError(lista.json) ?? `Evolution API respondió ${lista.status}.`);
      return { estado, numero: null, existe: true };
    }
    const filas = Array.isArray(lista.json) ? lista.json as Array<Record<string, unknown>> : [];
    const item = filas.find((i) => i?.name === this.instancia || i?.instanceName === this.instancia);
    if (!item && estado === "unknown") return { estado: "unknown", numero: null, existe: false };
    if (estado === "unknown" && item) estado = aEstado(item.connectionStatus ?? item.state);
    const numero = numeroDeJid(item?.ownerJid) ?? (typeof item?.number === "string" && /^\d{8,15}$/.test(item.number) ? `+${item.number}` : null);
    return { estado, numero, existe: true };
  }

  async cerrarSesion(): Promise<void> {
    const raw = await this.pedir("DELETE", `/instance/logout/${this.instancia}`);
    if (raw.kind === "network") throw new ErrorEvolution(`Evolution API no responde (${raw.error}).`);
    // 400 «not connected»: ya estaba desvinculada.
    if (raw.status >= 300 && raw.status !== 400) throw new ErrorEvolution(mensajeDeError(raw.json) ?? `Evolution API respondió ${raw.status}.`);
  }

  // PDF en base64 con el texto como pie (teinvito: evolutionMediaRequest). Sin «delay»: el ritmo lo marca la cola.
  async enviarDocumento(d: Documento): Promise<ResultadoProveedor> {
    const raw = await this.pedir("POST", `/message/sendMedia/${this.instancia}`, {
      number: d.numero.replace(/^\+/, ""), mediatype: "document", mimetype: "application/pdf", caption: d.texto, media: d.pdfBase64, fileName: d.nombreArchivo,
    }, 60000);
    return resultadoDeEnvio(raw);
  }
}

// Para local y pruebas: imita la vinculación y no envía nada. El estado es del proceso.
export class EvolutionSimulado implements ClienteEvolution {
  readonly simulado = true;
  private static readonly estados = new Map<string, ResumenInstancia>();
  private readonly instancia: string;

  constructor(linea: LineaEnvioWhatsApp = 1) { this.instancia = instanciaWhatsApp(linea); }
  static reiniciar(): void { EvolutionSimulado.estados.clear(); }
  // Equivale a escanear el código con el teléfono.
  static completarVinculo(numero = "+34000000000", linea: LineaEnvioWhatsApp = 1): void {
    EvolutionSimulado.estados.set(instanciaWhatsApp(linea), { existe: true, estado: "open", numero });
  }

  private get estado(): ResumenInstancia {
    return EvolutionSimulado.estados.get(this.instancia) ?? { existe: false, estado: "unknown", numero: null };
  }
  private set estado(estado: ResumenInstancia) { EvolutionSimulado.estados.set(this.instancia, estado); }

  async crearInstancia(): Promise<void> {
    if (!this.estado.existe) this.estado = { existe: true, estado: "close", numero: null };
  }
  async conectar(): Promise<CodigoVinculo> {
    if (this.estado.estado === "open") return { estado: "open", qr: null };
    this.estado = { ...this.estado, existe: true, estado: "connecting" };
    return { estado: "connecting", qr: await QRCode.toDataURL(`SIMULACION ${this.instancia}: este código no vincula ninguna cuenta.`, { margin: 2, width: 264 }) };
  }
  async resumen(): Promise<ResumenInstancia> { return { ...this.estado }; }
  async cerrarSesion(): Promise<void> {
    if (this.estado.existe) this.estado = { existe: true, estado: "close", numero: null };
  }
  async enviarDocumento(): Promise<ResultadoProveedor> {
    if (this.estado.estado !== "open") return { ok: false, permanente: false, error: "La línea simulada no está vinculada. El mensaje no salió." };
    return { ok: true, idExterno: `SIMULADO-wa-${Date.now().toString(36)}` };
  }
}

// EVOLUTION_API_URL vacía o «simulado», o sin clave → cliente simulado (como consulares). Nada sale de la aplicación.
export function clienteEvolution(opciones: { fetch?: FetchLike; linea?: LineaEnvioWhatsApp } = {}): ClienteEvolution {
  loadEnv();
  const url = (process.env.EVOLUTION_API_URL ?? "").trim();
  const clave = (process.env.EVOLUTION_API_KEY ?? "").trim();
  if (!url || url === "simulado" || !clave) return new EvolutionSimulado(opciones.linea);
  return new EvolutionHttp({ baseUrl: url, apiKey: clave, fetch: opciones.fetch, linea: opciones.linea });
}

export const hayClaveWhatsApp = (): boolean => !clienteEvolution().simulado;
