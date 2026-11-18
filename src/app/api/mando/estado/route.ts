import { adminOEstacionApi } from "@/server/guard";
import { estadoMando } from "@/server/mando";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await adminOEstacionApi(["mando"]))) return Response.json({ error: "No autorizado" }, { status: 401 });
  return Response.json(await estadoMando(), { headers: { "cache-control": "no-store" } });
}
