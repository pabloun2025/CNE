import { rechazoAdminApi, sesionApi } from "@/server/guard";
import { cartelDocumentos } from "@/server/pdf/cartel";
import { urlBase } from "@/server/url";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await sesionApi("admin")) && !(await sesionApi("superadmin"))) return rechazoAdminApi();
  const bytes = await cartelDocumentos(`${await urlBase()}/d`);
  return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": 'inline; filename="guia-cedula-y-pago-mjrv.pdf"', "cache-control": "no-store" } });
}
