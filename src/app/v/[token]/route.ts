import { BASE_ACREDITACION_EMBAJADA, buscarAcreditacionEmbajada } from "@/server/acreditaciones-embajada";
import { pdfAcreditacionEmbajada } from "@/server/pdf/acreditacion-embajada";

export const dynamic = "force-dynamic";
const cabeceras = { "cache-control": "private, no-store", "x-robots-tag": "noindex, nofollow" };

export async function GET(_peticion: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ficha = await buscarAcreditacionEmbajada(token);
  if (!ficha || ficha.revocada) return new Response("Credencial no disponible.", { status: 404, headers: cabeceras });

  const pdf = await pdfAcreditacionEmbajada({ nombre: ficha.nombre, cargo: ficha.cargo, url: BASE_ACREDITACION_EMBAJADA + token });
  return new Response(new Uint8Array(pdf), { headers: {
    ...cabeceras, "content-type": "application/pdf", "content-disposition": 'inline; filename="Credencial-Embajada.pdf"',
  } });
}
