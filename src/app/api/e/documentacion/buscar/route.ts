import { buscarPorCedula } from "@/server/documentos";
import { accesoDirectoEstacion } from "@/server/estaciones";

export const dynamic = "force-dynamic";

// La estación de Documentación recibe el nombre completo.
export async function POST(request: Request) {
  const e = await accesoDirectoEstacion(request, "documentacion");
  if (!e.ok) return Response.json({ error: "No autorizado" }, { status: e.status });
  const c = (await request.json().catch(() => null)) as { cedula?: unknown } | null;
  if (!c || typeof c.cedula !== "string") return Response.json({ error: "Falta el número de cédula." }, { status: 400 });
  const m = await buscarPorCedula(c.cedula);
  return Response.json(m ? { encontrada: true, ...m } : { encontrada: false });
}
