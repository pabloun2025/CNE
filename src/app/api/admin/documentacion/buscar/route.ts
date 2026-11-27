import { formatoPublicoJunta } from "@/domain/juntas";
import { CAPTURA_ADMIN } from "@/domain/roles";
import { buscarParaValidacion } from "@/server/documentos";
import { rechazoAdminApi, sesionApi } from "@/server/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!await sesionApi("admin", CAPTURA_ADMIN)) return rechazoAdminApi();
  const c = (await request.json().catch(() => null)) as { cedula?: unknown } | null;
  if (typeof c?.cedula !== "string") {
    return Response.json({ error: "Falta el número de cédula." }, { status: 400 });
  }
  const ficha = await buscarParaValidacion(c.cedula);
  return Response.json(ficha ? { encontrada: true, ...ficha, junta: formatoPublicoJunta(ficha.junta) } : { encontrada: false });
}
