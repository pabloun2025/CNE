import { rechazoAdminApi, sesionApi } from "@/server/guard";
import { descargarGuia, leerGuia } from "@/server/guias";

export const dynamic = "force-dynamic";

// Contiene los enlaces de estación activos: solo cónsul (y superadmin). Nunca se guarda en caché.
export async function GET(_request: Request, { params }: { params: Promise<{ n: string }> }) {
  const sesion = (await sesionApi("admin")) ?? (await sesionApi("superadmin"));
  if (!sesion) return rechazoAdminApi();
  const guia = leerGuia((await params).n);
  if (!guia) return new Response("Guía no encontrada.", { status: 404 });
  const { bytes, nombre } = await descargarGuia(sesion, guia);
  return new Response(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${nombre}"`, "cache-control": "private, no-store" } });
}
