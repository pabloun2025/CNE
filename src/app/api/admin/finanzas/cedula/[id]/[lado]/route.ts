import { CAPTURA_ADMIN } from "@/domain/roles";
import { rechazoAdminApi, sesionApi } from "@/server/guard";
import { esLadoDocumento } from "@/domain/documentos";
import { leerDocumento, leerDocumentoEnRevision } from "@/server/documentos";

export const dynamic = "force-dynamic";

// Vista previa de documentación para los puestos de validación y Finanzas.
export async function GET(request: Request, { params }: { params: Promise<{ id: string; lado: string }> }) {
  const sesion = await sesionApi("admin", CAPTURA_ADMIN);
  if (!sesion) return rechazoAdminApi();
  const { id, lado } = await params;
  if (!esLadoDocumento(lado) || !Number.isInteger(Number(id))) return new Response("No encontrado", { status: 404 });
  const parametros = new URL(request.url).searchParams;
  const modo = parametros.get("modo");
  const version = parametros.get("version");
  if (modo !== null && modo !== "prueba" && modo !== "eleccion") return new Response("No encontrado", { status: 404 });
  const juntaId = Number(parametros.get("juntaId"));
  const revisarMesa = sesion.rol === "verificador_mesas";
  if (revisarMesa && (!Number.isSafeInteger(juntaId) || juntaId < 1)) return new Response("Seleccione la junta", { status: 400 });
  if ((revisarMesa || sesion.rol === "validador" || version !== null) && (!modo || !version || !/^[0-9a-f]{64}$/.test(version))) {
    return new Response("No encontrado", { status: 404 });
  }
  const img = version && modo
    ? await leerDocumentoEnRevision(Number(id), lado, modo, version, juntaId > 0 ? juntaId : undefined)
    : await leerDocumento(Number(id), lado, undefined, modo ?? undefined);
  return img ? new Response(new Uint8Array(img), { headers: { "content-type": "image/jpeg", "cache-control": "private, no-store" } }) : new Response("No encontrado", { status: 404 });
}
