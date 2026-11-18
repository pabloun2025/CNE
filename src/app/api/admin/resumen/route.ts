import { sesionApi } from "@/server/guard";
import { resumenAdmin } from "@/server/resumen-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await sesionApi("admin"))) return Response.json({ error: "No autorizado" }, { status: 401 });
  return Response.json(await resumenAdmin(), { headers: { "cache-control": "no-store" } });
}
