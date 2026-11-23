import { sesionApi } from "@/server/guard";
import { estadoLinea, leerLineaWhatsApp } from "@/server/whatsapp-linea";

export const dynamic = "force-dynamic";

// Sondeo de la pantalla de vinculación. Con ?qr=1 devuelve además un código nuevo si la línea aún no está vinculada.
export async function GET(request: Request) {
  const sesion = await sesionApi("superadmin");
  if (!sesion) return Response.json({ error: "No autorizado" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const linea = leerLineaWhatsApp(params.get("linea"));
  if (linea === null) return Response.json({ error: "Línea de WhatsApp no válida." }, { status: 400 });
  return Response.json(await estadoLinea(sesion, { linea, conQr: params.get("qr") === "1" }), { headers: { "Cache-Control": "no-store" } });
}
