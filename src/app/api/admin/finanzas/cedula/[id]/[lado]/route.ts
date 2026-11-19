import { leerDocumento } from "@/server/documentos";
import { cuentaFinanzas } from "@/server/finanzas-cuenta";

export const dynamic = "force-dynamic";

// Vista previa en el módulo de pago. La ruta de la ficha de cónsul no se abre al financiero.
export async function GET(_: Request, { params }: { params: Promise<{ id: string; lado: string }> }) {
  const e = await cuentaFinanzas();
  if (!e.ok) return e.respuesta;
  const { id, lado } = await params;
  if ((lado !== "anverso" && lado !== "reverso") || !Number.isInteger(Number(id))) return new Response("No encontrado", { status: 404 });
  const img = await leerDocumento(Number(id), lado);
  return img ? new Response(new Uint8Array(img), { headers: { "content-type": "image/jpeg", "cache-control": "private, no-store" } }) : new Response("No encontrado", { status: 404 });
}
