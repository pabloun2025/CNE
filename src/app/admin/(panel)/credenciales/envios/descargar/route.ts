import { SOLO_CONSUL } from "@/domain/roles";
import { rechazoAdminApi, sesionApi } from "@/server/guard";
import { informeEnviosExcel } from "@/server/informe-envios";

export async function GET() {
  if (!(await sesionApi("admin", SOLO_CONSUL))) return rechazoAdminApi();
  return new Response(new Uint8Array(await informeEnviosExcel()), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": 'attachment; filename="informe-envios-credenciales.xlsx"',
      "cache-control": "private, no-store",
    },
  });
}
