import { loadEnv } from "../env";
import { pedirJson, type FetchLike, type Raw, type ResultadoProveedor } from "./http";

// Correo por Brevo (copia adaptada de consulares/src/domain/providers.ts: BrevoHttpSender). La cuenta es la de consulares.
export type Correo = { para: string; asunto: string; texto: string; remitente: { nombre: string; direccion: string }; adjunto: { nombre: string; base64: string } };

export interface ClienteCorreo {
  readonly simulado: boolean;
  verificarRemitente(direccion: string): Promise<boolean>;
  enviar(c: Correo): Promise<ResultadoProveedor>;
}

const aHtml = (t: string) => `<p>${t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`;

export function resultadoBrevo(raw: Raw): ResultadoProveedor {
  if (raw.kind === "network") {
    return raw.sent === "no"
      ? { ok: false, permanente: false, error: "No se pudo conectar con Brevo. El correo no salió." }
      : { ok: false, permanente: false, incierto: true, error: "Brevo no respondió a tiempo. El correo pudo haber salido." };
  }
  const json = raw.json as { messageId?: unknown; code?: unknown } | null;
  if (raw.status === 201 || raw.status === 202) {
    if (typeof json?.messageId === "string" && json.messageId.length <= 200) return { ok: true, idExterno: json.messageId };
    return { ok: false, permanente: false, incierto: true, error: "Brevo aceptó el correo sin devolver identificador." };
  }
  const codigo = typeof json?.code === "string" ? json.code : "";
  if (raw.status === 401 || codigo === "unauthorized") return { ok: false, permanente: false, error: "Brevo rechazó la clave. El correo no salió." };
  if (raw.status === 429) return { ok: false, permanente: false, error: "Brevo pidió esperar (límite de envío). El correo no salió." };
  if (/credit/i.test(codigo)) return { ok: false, permanente: false, error: "La cuenta de Brevo no tiene créditos. El correo no salió." };
  if (raw.status === 400 && codigo === "duplicate_request") return { ok: false, permanente: false, incierto: true, error: "Brevo indica una petición repetida. Puede que el correo ya haya salido." };
  if (raw.status >= 400 && raw.status < 500) return { ok: false, permanente: true, error: "Brevo rechazó el correo (dirección o datos no válidos)." };
  return { ok: false, permanente: false, incierto: true, error: `Brevo respondió ${raw.status}. El correo pudo haber salido.` };
}

export class BrevoHttp implements ClienteCorreo {
  readonly simulado = false;
  constructor(private readonly opciones: { apiKey: string; baseUrl?: string; timeoutMs?: number; fetch?: FetchLike }) {}

  private get base(): string {
    return (this.opciones.baseUrl ?? "https://api.brevo.com").replace(/\/$/, "");
  }

  async verificarRemitente(direccion: string): Promise<boolean> {
    const raw = await pedirJson(this.opciones.fetch, `${this.base}/v3/senders`, {
      method: "GET", headers: { "api-key": this.opciones.apiKey }, timeoutMs: this.opciones.timeoutMs ?? 8000,
    });
    if (raw.kind === "network") throw new Error("No se pudo conectar con Brevo.");
    if (raw.status !== 200) throw new Error(`Brevo no permitió comprobar el remitente (HTTP ${raw.status}).`);
    const senders = (raw.json as { senders?: unknown } | null)?.senders;
    if (!Array.isArray(senders)) throw new Error("Brevo no devolvió la lista de remitentes.");
    const correo = direccion.trim().toLowerCase();
    return senders.some((s: { email?: unknown; active?: unknown } | null) =>
      s?.active === true && typeof s.email === "string" && s.email.trim().toLowerCase() === correo);
  }

  async enviar(c: Correo): Promise<ResultadoProveedor> {
    const raw = await pedirJson(this.opciones.fetch, `${this.base}/v3/smtp/email`, {
      method: "POST",
      headers: { "api-key": this.opciones.apiKey },
      timeoutMs: this.opciones.timeoutMs ?? 30000,
      body: {
        sender: { name: c.remitente.nombre.slice(0, 70), email: c.remitente.direccion },
        to: [{ email: c.para }],
        subject: c.asunto,
        textContent: c.texto,
        htmlContent: aHtml(c.texto),
        attachment: [{ name: c.adjunto.nombre, content: c.adjunto.base64 }],
        tags: ["cne-madrid"],
      },
    });
    return resultadoBrevo(raw);
  }
}

export class CorreoSimulado implements ClienteCorreo {
  readonly simulado = true;
  async verificarRemitente(): Promise<boolean> { return false; }
  async enviar(): Promise<ResultadoProveedor> { return { ok: true, idExterno: `SIMULADO-correo-${Date.now().toString(36)}` }; }
}

// Sin BREVO_API_KEY → simulado.
export function clienteCorreo(opciones: { fetch?: FetchLike } = {}): ClienteCorreo {
  loadEnv();
  const clave = (process.env.BREVO_API_KEY ?? "").trim();
  return clave ? new BrevoHttp({ apiKey: clave, fetch: opciones.fetch }) : new CorreoSimulado();
}

export const hayClaveCorreo = (): boolean => !clienteCorreo().simulado;
