import { accesoDirectoEstacion } from "@/server/estaciones";
import { textoDeImagen } from "@/server/ocr-nombre";

export const dynamic = "force-dynamic";

// La cámara manda un fotograma cuando no hay QR. El texto vuelve a la puerta; si no se lee, se teclea.
export async function POST(request: Request) {
  const e = await accesoDirectoEstacion(request, "puerta");
  if (!e.ok) return Response.json({ error: "No autorizado" }, { status: e.status });
  const form = await request.formData().catch(() => null);
  const imagen = form?.get("imagen");
  if (!(imagen instanceof File) || imagen.size < 1000 || imagen.size > 1_500_000) return Response.json({ texto: "" });
  const texto = await textoDeImagen(Buffer.from(await imagen.arrayBuffer()));
  return Response.json({ texto });
}
