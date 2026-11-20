import { rechazoAdminApi, sesionApi } from "@/server/guard";
import { estadoLinea } from "@/server/whatsapp-linea";

export async function GET(request: Request) {
  const sesion = await sesionApi("admin");
  if (!sesion) return rechazoAdminApi();
  const conQr = new URL(request.url).searchParams.get("qr") === "1";
  return Response.json(await estadoLinea(sesion, { conQr }), { headers: { "Cache-Control": "no-store" } });
}
