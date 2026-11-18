import { TODOS_LOS_ROLES } from "@/domain/roles";
import { rechazoAdminApi, sesionApi } from "@/server/guard";
import { resumenAdmin, resumenParaRol } from "@/server/resumen-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const sesion = await sesionApi("admin", TODOS_LOS_ROLES);
  if (!sesion) return rechazoAdminApi();
  return Response.json(resumenParaRol(await resumenAdmin(), sesion.rol), { headers: { "cache-control": "no-store" } });
}
