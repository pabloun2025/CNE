import { generarRecibosContingencia, MAX_RECIBOS_LOTE } from "@/server/finanzas";
import { cuentaFinanzas, origenFormularioFinanzasPermitido } from "@/server/finanzas-cuenta";
import { descargarActasContingencia } from "@/server/recibos";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cuenta = await cuentaFinanzas();
  if (!cuenta.ok) return cuenta.respuesta;
  if (!await origenFormularioFinanzasPermitido(request)) {
    return Response.json({ error: "Origen no autorizado." }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const modo = form?.get("modo");
  if (modo != null && modo !== "prueba" && modo !== "eleccion") return Response.json({ error: "Modo no válido." }, { status: 400 });
  const formato = form?.get("formato");
  if (formato != null && formato !== "sin_anexo" && formato !== "manual") return Response.json({ error: "Formato no válido." }, { status: 400 });
  const ids = [...new Set((form?.getAll("id") ?? []).map((id) => typeof id === "string" && /^\d+$/.test(id) ? Number(id) : NaN))];
  if (!ids.length || ids.length > MAX_RECIBOS_LOTE || ids.some((id) => !Number.isSafeInteger(id) || id < 1)) {
    return Response.json({ error: `Seleccione entre 1 y ${MAX_RECIBOS_LOTE} fichas válidas.` }, { status: 400 });
  }
  if (formato === "manual") {
    if (!modo) return Response.json({ error: "Modo no válido." }, { status: 400 });
    const resultado = await descargarActasContingencia(cuenta.sesion, modo, ids);
    if (!resultado.ok) return Response.json({ error: resultado.mensaje }, { status: resultado.status });
    return responderPdf(resultado.pdf, "recibos-para-numerar-a-mano", ids.length > 1);
  }

  const resultado = await generarRecibosContingencia(cuenta.actor, ids, modo ?? undefined, formato === "sin_anexo");
  if (!resultado.ok) return Response.json({ error: resultado.mensaje }, { status: resultado.status });
  const nombre = ids.length === 1 ? `recibo-${resultado.numeros[0]}` : formato === "sin_anexo" ? "recibos-sin-anexo" : "recibos-contingencia";
  return responderPdf(resultado.pdf, nombre, formato === "sin_anexo" && ids.length > 1);
}

function responderPdf(pdf: Uint8Array, nombre: string, descarga: boolean) {
  return new Response(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${descarga ? "attachment" : "inline"}; filename="${nombre}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
