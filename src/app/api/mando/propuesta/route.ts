import { adminOEstacionApi } from "@/server/guard";
import { datosPropuesta } from "@/server/movimientos";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await adminOEstacionApi(["mando"]))) return Response.json({ error: "No autorizado" }, { status: 401 });
  return Response.json(await datosPropuesta(), { headers: { "cache-control": "no-store" } });
}
