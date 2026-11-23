import { instanciaWhatsApp } from "@/server/envios/evolution";
import { registrarEntregaWhatsApp } from "@/server/envios/whatsapp-entrega";
import { CABECERA_WEBHOOK_WHATSAPP, lineaWebhookWhatsApp, registrarRespuestaWhatsApp } from "@/server/envios/whatsapp-webhook";

const LIMITE_CUERPO = 64 * 1024;

async function leerCuerpo(request: Request): Promise<unknown> {
  if (!request.body) throw new Error();
  const lector = request.body.getReader();
  const partes: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > LIMITE_CUERPO) {
        void lector.cancel().catch(() => undefined);
        throw new Error();
      }
      partes.push(value);
    }
    return JSON.parse(Buffer.concat(partes).toString("utf8"));
  } finally {
    lector.releaseLock();
  }
}

export async function POST(request: Request): Promise<Response> {
  const linea = lineaWebhookWhatsApp(request.headers.get(CABECERA_WEBHOOK_WHATSAPP));
  if (linea === null) return Response.json({ error: "No autorizado." }, { status: 401 });

  let cuerpo: unknown;
  try {
    cuerpo = await leerCuerpo(request);
  } catch {
    // Evolution no reintenta ante un 400.
    return Response.json({ error: "Cuerpo no válido." }, { status: 400 });
  }
  const evento = cuerpo as { instance?: unknown; event?: unknown; data?: unknown } | null;
  if (evento?.instance !== instanciaWhatsApp(linea)) return Response.json({ error: "Instancia no autorizada." }, { status: 403 });
  try {
    if (evento.event === "messages.upsert") await registrarRespuestaWhatsApp(linea, evento.data);
    if (evento.event === "messages.update") await registrarEntregaWhatsApp(linea, cuerpo);
  } catch {
    return Response.json({ error: "La bandeja no está disponible." }, { status: 503 });
  }
  return Response.json({ ok: true });
}
