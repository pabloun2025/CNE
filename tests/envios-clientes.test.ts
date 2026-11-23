import { afterEach, describe, expect, it } from "vitest";
import { BrevoHttp, CorreoSimulado, clienteCorreo, resultadoBrevo } from "@/server/envios/brevo";
import { EvolutionHttp, EvolutionSimulado, INSTANCIA_CNE, clienteEvolution, resultadoDeEnvio } from "@/server/envios/evolution";
import type { FetchLike } from "@/server/envios/http";

// Ninguna prueba abre red: todo pasa por un fetch falso que anota la petición.
type Llamada = { url: string; method: string; headers: Record<string, string>; body: unknown };
function falso(respuestas: { status: number; json?: unknown }[]) {
  const llamadas: Llamada[] = [];
  const f: FetchLike = async (url, init) => {
    llamadas.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    const r = respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)];
    return { status: r.status, text: async () => (r.json === undefined ? "" : JSON.stringify(r.json)) };
  };
  return { f, llamadas };
}
const CLAVE = "clave-FICTICIA";
const evo = (f: FetchLike) => new EvolutionHttp({ baseUrl: "http://evolution-api:8080/", apiKey: CLAVE, fetch: f });

describe("cliente de Evolution API (instancia propia cne-madrid)", () => {
  it("toda ruta lleva la instancia fija y la cabecera apikey; crear va sin webhook", async () => {
    const { f, llamadas } = falso([{ status: 201, json: {} }, { status: 200, json: { base64: "data:image/png;base64,AAAA" } }, { status: 200, json: { instance: { state: "open" } } }, { status: 200, json: [{ name: INSTANCIA_CNE, ownerJid: "34600000000@s.whatsapp.net" }] }, { status: 200, json: {} }, { status: 201, json: { key: { id: "ABC123" } } }]);
    const c = evo(f);
    await c.crearInstancia();
    expect(await c.conectar()).toEqual({ estado: "connecting", qr: "data:image/png;base64,AAAA" });
    expect(await c.resumen()).toEqual({ estado: "open", numero: "+34600000000", existe: true });
    await c.cerrarSesion();
    expect(await c.enviarDocumento({ numero: "+34600000000", texto: "Hola", nombreArchivo: "c.pdf", pdfBase64: "UERG" })).toEqual({ ok: true, idExterno: "ABC123" });

    expect(llamadas.map((l) => `${l.method} ${l.url}`)).toEqual([
      "POST http://evolution-api:8080/instance/create",
      "GET http://evolution-api:8080/instance/connect/cne-madrid",
      "GET http://evolution-api:8080/instance/connectionState/cne-madrid",
      "GET http://evolution-api:8080/instance/fetchInstances?instanceName=cne-madrid",
      "DELETE http://evolution-api:8080/instance/logout/cne-madrid",
      "POST http://evolution-api:8080/message/sendMedia/cne-madrid",
    ]);
    // Ninguna URL (salvo la creación, cuyo cuerpo trae el nombre) se construye con otra instancia.
    for (const l of llamadas.slice(1)) expect(l.url).toContain("cne-madrid");
    expect(llamadas[0].body).toMatchObject({ instanceName: "cne-madrid", integration: "WHATSAPP-BAILEYS" });
    expect(JSON.stringify(llamadas[0].body)).not.toContain("webhook");
    for (const l of llamadas) expect(l.headers.apikey).toBe(CLAVE);
    expect(llamadas[5].body).toEqual({ number: "34600000000", mediatype: "document", mimetype: "application/pdf", caption: "Hola", media: "UERG", fileName: "c.pdf" });
  });

  it("habilita la recepción de mensajes solo en la instancia elegida", async () => {
    const { f, llamadas } = falso([{ status: 200 }, { status: 201 }]);
    const c = new EvolutionHttp({ baseUrl: "http://evolution-api:8080", apiKey: CLAVE, fetch: f, linea: 2 });
    await c.activarRecepcion("https://cne.ejemplo.invalid/api/webhooks/evolution", { "x-cne-whatsapp-token": "ficticio" });
    expect(llamadas.map((l) => [l.method, l.url])).toEqual([
      ["GET", "http://evolution-api:8080/webhook/find/cne-madrid-2"],
      ["POST", "http://evolution-api:8080/webhook/set/cne-madrid-2"],
    ]);
    expect(llamadas[1].body).toEqual({ webhook: {
      enabled: true, url: "https://cne.ejemplo.invalid/api/webhooks/evolution",
      headers: { "x-cne-whatsapp-token": "ficticio" }, byEvents: false, base64: false, events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE"],
    } });
  });

  it("deja intacto un webhook de otro servicio", async () => {
    const { f, llamadas } = falso([{ status: 200, json: { url: "https://otro.ejemplo.invalid", enabled: true } }]);
    await expect(evo(f).activarRecepcion("https://cne.ejemplo.invalid/api/webhooks/evolution", {})).rejects.toThrow(/otro webhook/);
    expect(llamadas).toHaveLength(1);
  });

  it("estado de una instancia que no existe → existe:false (404)", async () => {
    const { f } = falso([{ status: 404, json: { response: { message: ["no existe"] } } }]);
    expect(await evo(f).resumen()).toEqual({ estado: "unknown", numero: null, existe: false });
  });

  it("la segunda línea solo usa cne-madrid-2 y el cliente rechaza otros identificadores", async () => {
    const { f, llamadas } = falso([{ status: 201 }, { status: 200 },
      { status: 200, json: { instance: { state: "open" } } },
      { status: 200, json: [{ name: INSTANCIA_CNE, ownerJid: "34000000001@s.whatsapp.net" }, { name: "cne-madrid-2", ownerJid: "34000000002@s.whatsapp.net" }] },
      { status: 200 }, { status: 201, json: { key: { id: "simulado" } } }]);
    const c = new EvolutionHttp({ baseUrl: "http://evolution-api:8080", apiKey: CLAVE, fetch: f, linea: 2 });
    await c.crearInstancia();
    await c.conectar();
    expect(await c.resumen()).toMatchObject({ numero: "+34000000002" });
    await c.cerrarSesion();
    await c.enviarDocumento({ numero: "+34000000003", texto: "Hola", nombreArchivo: "c.pdf", pdfBase64: "UERG" });
    expect(llamadas[0].body).toMatchObject({ instanceName: "cne-madrid-2" });
    expect(llamadas.slice(1).every((l) => l.url.endsWith("cne-madrid-2"))).toBe(true);
    expect(() => new EvolutionHttp({ baseUrl: "http://evolution-api:8080", apiKey: CLAVE, fetch: f, linea: 3 as 2 })).toThrow();
  });

  // Evolution 2.3.7: connectionState es 200 sin state si la instancia no está en memoria.
  it("connectionState 200 sin state y fetchInstances 404 → la instancia no existe", async () => {
    const { f, llamadas } = falso([
      { status: 200, json: { instance: { instanceName: INSTANCIA_CNE } } },
      { status: 404, json: { message: "The instance does not exist" } },
    ]);
    expect(await evo(f).resumen()).toEqual({ estado: "unknown", numero: null, existe: false });
    expect(llamadas.map((l) => l.url)).toEqual([
      "http://evolution-api:8080/instance/connectionState/cne-madrid",
      "http://evolution-api:8080/instance/fetchInstances?instanceName=cne-madrid",
    ]);
  });

  it("connect con error:true no devuelve un código en blanco", async () => {
    const { f } = falso([{ status: 200, json: { error: true, message: 'BadRequestException: The "cne-madrid" instance does not exist' } }]);
    await expect(evo(f).conectar()).rejects.toThrow(/does not exist/);
  });

  it("acepta el PNG en base64 pelado y dibuja el código si no viene imagen", async () => {
    const crudo = "A".repeat(100);
    const { f } = falso([{ status: 200, json: { base64: crudo } }]);
    expect(await evo(f).conectar()).toEqual({ estado: "connecting", qr: `data:image/png;base64,${crudo}` });
    const { f: f2 } = falso([{ status: 200, json: { code: "2@SIMULADO-NO-VINCULA" } }]);
    expect((await evo(f2).conectar()).qr).toMatch(/^data:image\/png;base64,/);
  });

  it("si el nombre ya está en uso, crear no aborta", async () => {
    const { f } = falso([{ status: 403, json: { response: { message: "This name is already in use" } } }]);
    await expect(evo(f).crearInstancia()).resolves.toBeUndefined();
  });

  it("resultados de envío: número sin WhatsApp, credencial, 5xx incierto, sin identificador", () => {
    expect(resultadoDeEnvio({ kind: "response", status: 400, json: { response: { message: [{ exists: false }] } } })).toMatchObject({ ok: false, permanente: true, error: "El número no tiene WhatsApp." });
    expect(resultadoDeEnvio({ kind: "response", status: 401, json: null })).toMatchObject({ ok: false, permanente: false });
    expect(resultadoDeEnvio({ kind: "response", status: 502, json: null })).toMatchObject({ ok: false, incierto: true });
    expect(resultadoDeEnvio({ kind: "response", status: 201, json: {} })).toMatchObject({ ok: false, incierto: true });
    expect(resultadoDeEnvio({ kind: "network", sent: "no", error: "ECONNREFUSED" })).toMatchObject({ ok: false, permanente: false });
    expect(resultadoDeEnvio({ kind: "network", sent: "unknown", error: "TIMEOUT" })).toMatchObject({ ok: false, incierto: true });
  });
});

describe("cliente de Brevo", () => {
  it("comprueba por lectura que el remitente está activo sin enviar un correo", async () => {
    const { f, llamadas } = falso([{ status: 200, json: { senders: [
      { email: "activa@ejemplo.invalid", active: true }, { email: "inactiva@ejemplo.invalid", active: false },
    ] } }]);
    const c = new BrevoHttp({ apiKey: CLAVE, fetch: f });
    expect(await c.verificarRemitente("Activa@ejemplo.invalid")).toBe(true);
    expect(await c.verificarRemitente("inactiva@ejemplo.invalid")).toBe(false);
    expect(llamadas.map(({ method, url }) => [method, url])).toEqual([
      ["GET", "https://api.brevo.com/v3/senders"], ["GET", "https://api.brevo.com/v3/senders"],
    ]);
  });
  const correo = { para: "persona@ejemplo.invalid", asunto: "Asunto", texto: "Hola <b>", remitente: { nombre: "Nombre", direccion: "remitente@ejemplo.invalid" }, adjunto: { nombre: "c.pdf", base64: "UERG" } };
  it("POST a /v3/smtp/email con api-key, remitente, adjunto y texto escapado en el html", async () => {
    const { f, llamadas } = falso([{ status: 201, json: { messageId: "<id@brevo>" } }]);
    expect(await new BrevoHttp({ apiKey: CLAVE, fetch: f }).enviar(correo)).toEqual({ ok: true, idExterno: "<id@brevo>" });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(llamadas[0].headers["api-key"]).toBe(CLAVE);
    expect(llamadas[0].body).toMatchObject({ sender: { name: "Nombre", email: "remitente@ejemplo.invalid" }, to: [{ email: "persona@ejemplo.invalid" }], subject: "Asunto", attachment: [{ name: "c.pdf", content: "UERG" }] });
    expect(llamadas[0].body).not.toHaveProperty("replyTo");
    expect((llamadas[0].body as { htmlContent: string }).htmlContent).toContain("&lt;b&gt;");
  });

  it("envía la dirección de respuesta por separado del remitente", async () => {
    const { f, llamadas } = falso([{ status: 201, json: { messageId: "<id@brevo>" } }]);
    const mensaje = { ...correo, responderA: "respuestas@ejemplo.invalid" };
    await new BrevoHttp({ apiKey: CLAVE, fetch: f }).enviar(mensaje);
    expect(llamadas[0].body).toMatchObject({
      sender: { name: "Nombre", email: "remitente@ejemplo.invalid" },
      replyTo: { email: "respuestas@ejemplo.invalid" },
    });
  });
  it("traduce errores de Brevo", () => {
    expect(resultadoBrevo({ kind: "response", status: 401, json: null })).toMatchObject({ ok: false, permanente: false });
    expect(resultadoBrevo({ kind: "response", status: 429, json: null })).toMatchObject({ ok: false, permanente: false });
    expect(resultadoBrevo({ kind: "response", status: 400, json: { code: "invalid_parameter" } })).toMatchObject({ ok: false, permanente: true });
    expect(resultadoBrevo({ kind: "response", status: 500, json: null })).toMatchObject({ ok: false, incierto: true });
  });

  it("envía la plantilla HTML junto con el texto alternativo y el adjunto", async () => {
    const { f, llamadas } = falso([{ status: 201, json: { messageId: "<id@brevo>" } }]);
    const institucional = { ...correo, html: "<h1>Su credencial de MJRV</h1>" };
    await new BrevoHttp({ apiKey: CLAVE, fetch: f }).enviar(institucional);
    expect(llamadas[0].body).toMatchObject({ htmlContent: institucional.html, textContent: correo.texto, attachment: [{ name: "c.pdf", content: "UERG" }] });
  });
});

describe("fábricas: sin claves, todo simulado", () => {
  const guardado = { ...process.env };
  afterEach(() => { process.env = { ...guardado }; });

  it("EVOLUTION_API_URL vacía, «simulado» o sin clave → simulado; con URL y clave → real", () => {
    for (const [url, clave] of [["", "k"], ["simulado", "k"], ["http://x:8080", ""]] as const) {
      process.env.EVOLUTION_API_URL = url; process.env.EVOLUTION_API_KEY = clave;
      expect(clienteEvolution()).toBeInstanceOf(EvolutionSimulado);
    }
    process.env.EVOLUTION_API_URL = "http://x:8080"; process.env.EVOLUTION_API_KEY = "k";
    expect(clienteEvolution()).toBeInstanceOf(EvolutionHttp);
  });
  it("sin BREVO_API_KEY → simulado", () => {
    delete process.env.BREVO_API_KEY;
    expect(clienteCorreo()).toBeInstanceOf(CorreoSimulado);
    process.env.BREVO_API_KEY = "k";
    expect(clienteCorreo()).toBeInstanceOf(BrevoHttp);
  });
  it("la línea simulada se crea, vincula y desvincula sin red", async () => {
    EvolutionSimulado.reiniciar();
    const c = new EvolutionSimulado();
    expect(await c.resumen()).toMatchObject({ existe: false });
    await c.crearInstancia(); await c.crearInstancia();
    expect((await c.conectar()).qr).toMatch(/^data:image\/png;base64,/);
    expect(await c.enviarDocumento()).toMatchObject({ ok: false });
    EvolutionSimulado.completarVinculo();
    expect(await c.enviarDocumento()).toMatchObject({ ok: true });
    await c.cerrarSesion();
    expect(await c.resumen()).toMatchObject({ estado: "close", numero: null });
    EvolutionSimulado.reiniciar();
  });
});
