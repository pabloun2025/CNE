import { listarEscaneadosFinanzas } from "@/server/escaneos-finanzas";
import { cuentaFinanzas } from "@/server/finanzas-cuenta";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const e = await cuentaFinanzas();
  if (!e.ok) return e.respuesta;
  const caja = new URL(request.url).searchParams.get("caja") === "1";
  return Response.json(await listarEscaneadosFinanzas(caja), { headers: { "cache-control": "no-store" } });
}
