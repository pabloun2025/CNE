import { estacionApi } from "@/server/guard";
import { contadoresPuerta, registrarLectura } from "@/server/puerta";

export const dynamic = "force-dynamic";

export async function GET() {
  const e = await estacionApi(["puerta"]);
  if (!e.ok) return Response.json({ error: "No autorizado" }, { status: e.status });
  return Response.json(await contadoresPuerta(e.sesion.enlaceId));
}

export async function POST(request: Request) {
  const e = await estacionApi(["puerta"]);
  if (!e.ok) return Response.json({ error: "No autorizado" }, { status: e.status });
  const cuerpo = (await request.json().catch(() => null)) as { codigo?: unknown; dispositivo?: unknown } | null;
  if (!cuerpo || typeof cuerpo.codigo !== "string" || !cuerpo.codigo.trim()) return Response.json({ error: "Falta el código" }, { status: 400 });
  const lectura = await registrarLectura(e.sesion, cuerpo.codigo, typeof cuerpo.dispositivo === "string" ? cuerpo.dispositivo : null);
  return Response.json({ lectura, contadores: await contadoresPuerta(e.sesion.enlaceId) });
}
