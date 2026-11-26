import { envioAcuseSmsAutorizado, registrarAcusesSms } from "@/server/envios/sms-seguimiento";

export async function POST(request: Request): Promise<Response> {
  const envio = envioAcuseSmsAutorizado(new URL(request.url));
  if (envio === null) return Response.json({ error: "No autorizado." }, { status: 401 });
  const texto = await request.text();
  if (texto.length > 64_000) return Response.json({ error: "Cuerpo demasiado grande." }, { status: 413 });
  let cuerpo: unknown;
  try { cuerpo = JSON.parse(texto); } catch { return Response.json({ error: "JSON no válido." }, { status: 400 }); }
  await registrarAcusesSms(envio, cuerpo);
  return Response.json({ ok: true });
}
