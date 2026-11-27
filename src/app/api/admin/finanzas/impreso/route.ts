import { marcarReciboImpreso } from "@/server/escaneos-finanzas";
import { cuentaFinanzas } from "@/server/finanzas-cuenta";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cuenta = await cuentaFinanzas();
  if (!cuenta.ok) return cuenta.respuesta;
  const datos = await request.json().catch(() => null) as { mjrvId?: unknown; actaId?: unknown; modo?: unknown; version?: unknown } | null;
  if (!datos || typeof datos.mjrvId !== "number" || typeof datos.actaId !== "number"
    || !Number.isSafeInteger(datos.mjrvId) || datos.mjrvId < 1 || !Number.isSafeInteger(datos.actaId) || datos.actaId < 1
    || (datos.modo !== "prueba" && datos.modo !== "eleccion")
    || (typeof datos.version !== "string" || !/^[a-f0-9]{64}$/.test(datos.version))) {
    return Response.json({ ok: false, mensaje: "Indique la ficha, el recibo y el modo vigentes." }, { status: 400 });
  }
  const resultado = await marcarReciboImpreso(cuenta.actor, {
    mjrvId: datos.mjrvId, actaId: datos.actaId, modo: datos.modo, version: datos.version,
  });
  return Response.json(resultado, { status: resultado.ok ? 200 : 409, headers: { "cache-control": "no-store" } });
}
