import { leerDocumento } from "@/server/documentos";
import { sesionApi } from "@/server/guard";

export const dynamic = "force-dynamic";

// Miniaturas de la ficha: solo administración, tras la guarda. Nunca hay URL pública.
export async function GET(_: Request, { params }: { params: Promise<{ id: string; lado: string }> }) {
  if (!(await sesionApi("admin"))) return new Response("No autorizado", { status: 401 });
  const { id, lado } = await params;
  if ((lado !== "anverso" && lado !== "reverso") || !Number.isInteger(Number(id))) return new Response("No encontrado", { status: 404 });
  const img = await leerDocumento(Number(id), lado);
  return img ? new Response(new Uint8Array(img), { headers: { "content-type": "image/jpeg", "cache-control": "private, no-store" } }) : new Response("No encontrado", { status: 404 });
}
