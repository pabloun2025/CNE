import { sesionApi } from "@/server/guard";
import { estadoLinea } from "@/server/whatsapp-linea";

export const dynamic = "force-dynamic";

// Sondeo de la pantalla de vinculación. Con ?qr=1 devuelve además un código nuevo si la línea aún no está vinculada.
export async function GET(request: Request) {
  const sesion = await sesionApi("superadmin");
  if (!sesion) return Response.json({ error: "No autorizado" }, { status: 401 });
  const conQr = new URL(request.url).searchParams.get("qr") === "1";
  return Response.json(await estadoLinea(sesion, { conQr }), { headers: { "Cache-Control": "no-store" } });
}
