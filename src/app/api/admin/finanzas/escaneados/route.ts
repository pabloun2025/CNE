import { listarEscaneadosFinanzas } from "@/server/escaneos-finanzas";
import { cuentaFinanzas } from "@/server/finanzas-cuenta";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const e = await cuentaFinanzas();
  if (!e.ok) return e.respuesta;
  const parametros = new URL(request.url).searchParams;
  const etapa = parametros.get("etapa");
  if (etapa !== null && etapa !== "revision" && etapa !== "impresion" && etapa !== "caja") {
    return Response.json({ error: "Etapa no válida." }, { status: 400 });
  }
  return Response.json(await listarEscaneadosFinanzas(etapa ?? (parametros.get("caja") === "1")), { headers: { "cache-control": "no-store" } });
}
