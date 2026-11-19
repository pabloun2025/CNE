import { cuentaFinanzas } from "@/server/finanzas-cuenta";
import { escanearParaRecibo } from "@/server/impresion-actas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const e = await cuentaFinanzas();
  if (!e.ok) return e.respuesta;
  const c = (await request.json().catch(() => null)) as { cedula?: unknown } | null;
  if (!c || typeof c.cedula !== "string" || !c.cedula.trim()) return Response.json({ ok: false, mensaje: "Falta la cédula." }, { status: 400 });
  return Response.json(await escanearParaRecibo(e.actor, c.cedula), { headers: { "cache-control": "no-store" } });
}
