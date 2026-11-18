import { CONSUL_Y_COORDINADOR } from "@/domain/roles";
import { adminOEstacionApi, rechazoAdminApi } from "@/server/guard";
import { estadoMando } from "@/server/mando";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await adminOEstacionApi(["mando"], CONSUL_Y_COORDINADOR))) return rechazoAdminApi();
  return Response.json(await estadoMando(), { headers: { "cache-control": "no-store" } });
}
