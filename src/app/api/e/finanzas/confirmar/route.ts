import { estacionApi } from "@/server/guard";
import { confirmarPago } from "@/server/finanzas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const e = await estacionApi(["finanzas"]);
  if (!e.ok) return Response.json({ error: "No autorizado" }, { status: e.status });
  const c = (await request.json().catch(() => null)) as { mjrvId?: unknown; actaId?: unknown; verificado?: unknown } | null;
  if (!c || !Number.isInteger(c.mjrvId) || !Number.isInteger(c.actaId)) return Response.json({ error: "Datos incompletos." }, { status: 400 });
  return Response.json(await confirmarPago(e.sesion, { mjrvId: c.mjrvId as number, actaId: c.actaId as number, verificado: c.verificado === true }));
}
