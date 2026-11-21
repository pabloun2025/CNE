import { cuentaFinanzas, origenFormularioFinanzasPermitido } from "@/server/finanzas-cuenta";
import { descargarActasContingencia } from "@/server/recibos";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cuenta = await cuentaFinanzas();
  if (!cuenta.ok) return cuenta.respuesta;
  if (!await origenFormularioFinanzasPermitido(request)) return new Response("Origen no autorizado.", { status: 403 });

  const form = await request.formData().catch(() => null);
  const modo = form?.get("modo");
  if (modo !== "prueba" && modo !== "eleccion") return new Response("Modo no válido.", { status: 400 });

  const resultado = await descargarActasContingencia(cuenta.sesion, modo);
  if (!resultado.ok) return new Response(resultado.mensaje, { status: resultado.status });
  return new Response(Buffer.from(resultado.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="actas-contingencia-${modo}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
