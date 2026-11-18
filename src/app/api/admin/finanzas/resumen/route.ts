import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { rechazoAdminApi, sesionApi } from "@/server/guard";
import { resumenFinanzas } from "@/server/finanzas-resumen";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await sesionApi("admin", CONSUL_Y_FINANCIERO))) return rechazoAdminApi();
  return Response.json(await resumenFinanzas(), { headers: { "cache-control": "no-store" } });
}
