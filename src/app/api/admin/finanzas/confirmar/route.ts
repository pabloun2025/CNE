import { confirmarPago } from "@/server/finanzas";
import { cuentaFinanzas } from "@/server/finanzas-cuenta";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const e = await cuentaFinanzas();
  if (!e.ok) return e.respuesta;
  const c = (await request.json().catch(() => null)) as { mjrvId?: unknown; actaId?: unknown; verificado?: unknown } | null;
  if (!c || !Number.isInteger(c.mjrvId) || !Number.isInteger(c.actaId)) return Response.json({ error: "Datos incompletos." }, { status: 400 });
  return Response.json(await confirmarPago(e.actor, { mjrvId: c.mjrvId as number, actaId: c.actaId as number, verificado: c.verificado === true }));
}
