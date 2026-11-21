import { fichaPago } from "@/server/finanzas";
import { cuentaFinanzas } from "@/server/finanzas-cuenta";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const e = await cuentaFinanzas();
  if (!e.ok) return e.respuesta;
  const c = (await request.json().catch(() => null)) as { cedula?: unknown; vista?: unknown } | null;
  if (!c || typeof c.cedula !== "string") return Response.json({ error: "Falta la cédula." }, { status: 400 });
  const ficha = await fichaPago(c.cedula, c.vista === "caja" ? undefined : e.actor);
  return Response.json(ficha ? { encontrada: true, ficha } : { encontrada: false }, { headers: { "cache-control": "no-store" } });
}
