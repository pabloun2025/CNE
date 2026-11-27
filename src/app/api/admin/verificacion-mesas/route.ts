import { MESAS_ADMIN } from "@/domain/roles";
import { rechazoAdminApi, sesionApi } from "@/server/guard";
import { procesarSolicitudMesa } from "@/server/verificacion-mesas-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sesion = await sesionApi("admin", MESAS_ADMIN);
  if (!sesion) return rechazoAdminApi();
  return procesarSolicitudMesa(request, { tipo: "madrid_admin", id: sesion.usuarioId, nombre: sesion.nombre });
}
