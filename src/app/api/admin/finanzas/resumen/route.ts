import { sesionApi } from "@/server/guard";
import { resumenFinanzas } from "@/server/finanzas-resumen";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await sesionApi("admin"))) return Response.json({ error: "No autorizado" }, { status: 401 });
  return Response.json(await resumenFinanzas(), { headers: { "cache-control": "no-store" } });
}
