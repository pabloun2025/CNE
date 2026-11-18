import { CONSUL_Y_COORDINADOR } from "@/domain/roles";
import { adminOEstacionApi, rechazoAdminApi } from "@/server/guard";
import { detalleJunta } from "@/server/mando";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await adminOEstacionApi(["mando"], CONSUL_Y_COORDINADOR))) return rechazoAdminApi();
  const id = Number(new URL(request.url).searchParams.get("id"));
  const d = Number.isInteger(id) ? await detalleJunta(id) : null;
  return d ? Response.json(d, { headers: { "cache-control": "no-store" } }) : Response.json({ error: "No existe" }, { status: 404 });
}
