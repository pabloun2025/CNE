import { estacionApi } from "@/server/guard";
import { dejarPasar } from "@/server/puerta";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const e = await estacionApi(["puerta"]);
  if (!e.ok) return Response.json({ error: "No autorizado" }, { status: e.status });
  const cuerpo = (await request.json().catch(() => null)) as { mjrvId?: unknown } | null;
  if (!cuerpo || typeof cuerpo.mjrvId !== "number" || !Number.isInteger(cuerpo.mjrvId)) return Response.json({ error: "Falta la persona" }, { status: 400 });
  const r = await dejarPasar(e.sesion, cuerpo.mjrvId);
  return r.ok ? Response.json({ ok: true }) : Response.json({ error: r.mensaje }, { status: r.status });
}
