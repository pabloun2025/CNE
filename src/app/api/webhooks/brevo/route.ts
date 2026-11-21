import { registrarEventoBrevo, webhookBrevoAutorizado } from "@/server/envios/brevo-webhook";

export async function POST(request: Request): Promise<Response> {
  if (!webhookBrevoAutorizado(request.headers.get("authorization"))) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  const texto = await request.text();
  if (texto.length > 64_000) return Response.json({ error: "Cuerpo demasiado grande." }, { status: 413 });
  let cuerpo: unknown;
  try { cuerpo = JSON.parse(texto); } catch { return Response.json({ error: "JSON no válido." }, { status: 400 }); }
  await registrarEventoBrevo(cuerpo);
  return Response.json({ ok: true });
}
