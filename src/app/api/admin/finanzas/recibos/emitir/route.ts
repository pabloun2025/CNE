import { generarRecibosContingencia } from "@/server/finanzas";
import { cuentaFinanzas } from "@/server/finanzas-cuenta";
import { urlBase } from "@/server/url";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cuenta = await cuentaFinanzas();
  if (!cuenta.ok) return cuenta.respuesta;
  const origen = request.headers.get("origin");
  // La política no-referrer puede hacer que el navegador envíe Origin: null al enviar el formulario.
  const mismoSitio = request.headers.get("sec-fetch-site") === "same-origin";
  if (origen === "null" ? !mismoSitio : origen && origen !== await urlBase()) {
    return new Response("Origen no autorizado.", { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const ids = (form?.getAll("id") ?? []).map((id) => typeof id === "string" && /^\d+$/.test(id) ? Number(id) : NaN);
  const resultado = await generarRecibosContingencia(cuenta.actor, ids);
  if (!resultado.ok) return new Response(resultado.mensaje, { status: resultado.status });
  const nombre = resultado.numeros.length === 1 ? `recibo-${resultado.numeros[0]}` : "recibos-contingencia";

  return new Response(Buffer.from(resultado.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${nombre}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
