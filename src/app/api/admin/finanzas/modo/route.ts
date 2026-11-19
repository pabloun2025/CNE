import { cuentaFinanzas } from "@/server/finanzas-cuenta";
import { fijarModoRecibo, leerModoRecibo, type ModoRecibo } from "@/server/impresion-actas";

export const dynamic = "force-dynamic";

export async function GET() {
  const e = await cuentaFinanzas();
  if (!e.ok) return e.respuesta;
  return Response.json({ modo: await leerModoRecibo() }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const e = await cuentaFinanzas();
  if (!e.ok) return e.respuesta;
  const c = (await request.json().catch(() => null)) as { modo?: unknown } | null;
  if (c?.modo !== "impresion" && c?.modo !== "digital") return Response.json({ error: "Modo no válido." }, { status: 400 });
  await fijarModoRecibo(c.modo as ModoRecibo);
  return Response.json({ modo: c.modo });
}
