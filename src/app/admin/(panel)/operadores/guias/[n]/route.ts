import { rechazoAdminApi, sesionApi } from "@/server/guard";
import { descargarGuia, leerGuia } from "@/server/guias";

export const dynamic = "force-dynamic";

// Contiene los enlaces de estación activos: solo cónsul. Nunca se guarda en caché.
export async function GET(_request: Request, { params }: { params: Promise<{ n: string }> }) {
  const sesion = await sesionApi("admin");
  if (!sesion) return rechazoAdminApi();
  const guia = leerGuia((await params).n);
  if (!guia) return new Response("Guía no encontrada.", { status: 404 });
  const { cuerpo, nombre, tipo } = await descargarGuia(sesion, guia);
  return new Response(cuerpo, { headers: { "content-type": tipo, "content-disposition": `attachment; filename="${nombre}"`, "cache-control": "private, no-store" } });
}
