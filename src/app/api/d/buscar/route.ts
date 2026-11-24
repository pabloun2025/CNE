import { formatoPublicoJunta } from "@/domain/juntas";
import { buscarPorCedula, ipDeSolicitud, permitirPublico } from "@/server/documentos";

export const dynamic = "force-dynamic";

// Público y limitado: devuelve solo iniciales y junta (§16.2).
export async function POST(request: Request) {
  if (!(await permitirPublico(ipDeSolicitud(request.headers), "buscar"))) return Response.json({ error: "Demasiadas consultas. Espere unos minutos o pida ayuda al personal." }, { status: 429 });
  const c = (await request.json().catch(() => null)) as { cedula?: unknown } | null;
  if (!c || typeof c.cedula !== "string") return Response.json({ error: "Falta el número de cédula." }, { status: 400 });
  const m = await buscarPorCedula(c.cedula);
  if (!m) return Response.json({ encontrada: false });
  return Response.json({ encontrada: true, iniciales: m.iniciales, junta: formatoPublicoJunta(m.junta), anverso: m.anverso, reverso: m.reverso, pasaporte: m.pasaporte });
}
