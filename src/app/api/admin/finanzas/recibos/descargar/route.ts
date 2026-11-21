import { cuentaFinanzas, origenFormularioFinanzasPermitido } from "@/server/finanzas-cuenta";
import { descargarSeleccionRecibos, type SeleccionRecibosEmitidos, type TipoRecibo } from "@/server/recibos";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cuenta = await cuentaFinanzas();
  if (!cuenta.ok) return cuenta.respuesta;
  if (!await origenFormularioFinanzasPermitido(request)) return new Response("Origen no autorizado.", { status: 403 });

  const form = await request.formData().catch(() => null);
  const modo = form?.get("modo");
  const error = () => new Response("Seleccione recibos válidos para descargar.", { status: 400 });
  if (!form || (modo !== "prueba" && modo !== "eleccion")) return error();
  const incluirCedula = form.get("anexo") === "1";

  let seleccion: SeleccionRecibosEmitidos;
  if (form.get("alcance") === "todos") {
    const total = Number(form.get("total"));
    const q = form.get("q");
    if (!Number.isSafeInteger(total) || total < 1 || typeof q !== "string") return error();
    seleccion = { modo, q, total, incluirCedula };
  } else {
    const referencias = [];
    for (const valor of new Set(form.getAll("recibo"))) {
      const match = typeof valor === "string" ? /^(acta|firma)-([1-9]\d*)$/.exec(valor) : null;
      const id = Number(match?.[2]);
      if (!match || !Number.isSafeInteger(id)) return error();
      const tipo: TipoRecibo = match[1] === "acta" ? "acta" : "firma";
      referencias.push({ tipo, id });
    }
    if (!referencias.length) return error();
    seleccion = { modo, referencias, incluirCedula };
  }

  const resultado = await descargarSeleccionRecibos(cuenta.sesion, seleccion);
  if (!resultado.ok) return new Response(resultado.mensaje, { status: resultado.status });
  return new Response(resultado.contenido, {
    headers: {
      "content-type": resultado.tipo,
      "content-disposition": `attachment; filename="${resultado.nombre}"`,
      "cache-control": "private, no-store",
    },
  });
}
