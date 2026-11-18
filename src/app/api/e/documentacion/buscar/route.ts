import { buscarPorCedula } from "@/server/documentos";
import { estacionApi } from "@/server/guard";

export const dynamic = "force-dynamic";

// Documentación y finanzas ven el nombre completo (con PIN); el público no.
export async function POST(request: Request) {
  const e = await estacionApi(["documentacion", "finanzas"]);
  if (!e.ok) return Response.json({ error: "No autorizado" }, { status: e.status });
  const c = (await request.json().catch(() => null)) as { cedula?: unknown } | null;
  if (!c || typeof c.cedula !== "string") return Response.json({ error: "Falta la cédula." }, { status: 400 });
  const m = await buscarPorCedula(c.cedula);
  return Response.json(m ? { encontrada: true, ...m } : { encontrada: false });
}
