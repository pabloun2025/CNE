import { CONSUL_Y_COORDINADOR } from "@/domain/roles";
import { adminOEstacionApi, rechazoAdminApi } from "@/server/guard";
import { datosPropuesta } from "@/server/movimientos";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await adminOEstacionApi(["mando"], CONSUL_Y_COORDINADOR))) return rechazoAdminApi();
  return Response.json(await datosPropuesta(), { headers: { "cache-control": "no-store" } });
}
