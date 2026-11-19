import { cuentaFinanzas } from "@/server/finanzas-cuenta";
import { listarPendientes } from "@/server/impresion-actas";

export const dynamic = "force-dynamic";

export async function GET() {
  const e = await cuentaFinanzas();
  if (!e.ok) return e.respuesta;
  return Response.json({ pendientes: await listarPendientes() }, { headers: { "cache-control": "no-store" } });
}
