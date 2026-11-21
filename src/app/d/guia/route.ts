import { cartelDocumentos } from "@/server/pdf/cartel";
import { urlBase } from "@/server/url";

export async function GET() {
  const bytes = await cartelDocumentos(`${await urlBase()}/d`);
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="guia-documento-y-pago-mjrv.pdf"',
      "cache-control": "no-store",
    },
  });
}
