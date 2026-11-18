import { estacionApi } from "@/server/guard";
import { fichaPago } from "@/server/finanzas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const e = await estacionApi(["finanzas"]);
  if (!e.ok) return Response.json({ error: "No autorizado" }, { status: e.status });
  const c = (await request.json().catch(() => null)) as { cedula?: unknown } | null;
  if (!c || typeof c.cedula !== "string") return Response.json({ error: "Falta la cédula." }, { status: 400 });
  const ficha = await fichaPago(c.cedula, e.sesion);
  return Response.json(ficha ? { encontrada: true, ficha } : { encontrada: false }, { headers: { "cache-control": "no-store" } });
}
