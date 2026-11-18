import { leerModo } from "@/server/config";
import { rechazoAdminApi, sesionApi } from "@/server/guard";
import { cartelDocumentos } from "@/server/pdf/cartel";
import { urlBase } from "@/server/url";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await sesionApi("admin"))) return rechazoAdminApi();
  const bytes = await cartelDocumentos(`${await urlBase()}/d`, (await leerModo()) === "prueba");
  return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": 'inline; filename="cartel-documentos.pdf"', "cache-control": "no-store" } });
}
