import { formatoPublicoJunta } from "@/domain/juntas";
import { CAPTURA_ADMIN } from "@/domain/roles";
import { buscarParaValidacion } from "@/server/documentos";
import { rechazoAdminApi, sesionApi } from "@/server/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sesion = await sesionApi("admin", CAPTURA_ADMIN);
  if (!sesion) return rechazoAdminApi();
  const c = (await request.json().catch(() => null)) as { cedula?: unknown; juntaId?: unknown } | null;
  if (typeof c?.cedula !== "string") {
    return Response.json({ error: "Falta el número de cédula." }, { status: 400 });
  }
  const revisarMesa = sesion.rol === "verificador_mesas";
  const juntaId = typeof c.juntaId === "number" && Number.isSafeInteger(c.juntaId) && c.juntaId > 0 ? c.juntaId : undefined;
  const ficha = await buscarParaValidacion(c.cedula, juntaId);
  if (!ficha) return Response.json({ encontrada: false });
  const { version, ...datos } = ficha;
  return Response.json({
    encontrada: true, ...datos, junta: formatoPublicoJunta(datos.junta),
    ...(!revisarMesa || juntaId !== undefined ? { version } : {}),
  }, { headers: { "cache-control": "private, no-store" } });
}
