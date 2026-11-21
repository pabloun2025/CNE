import { medidasCredencial } from "@/server/credencial-config";
import { leerIdsCredenciales, marcarGeneradas, nombrePdfCredencial, seleccionarParaCredencial, type Seleccion } from "@/server/credenciales";
import { rechazoAdminApi, sesionApi } from "@/server/guard";
import { credencialesIndividuales, hojasA4 } from "@/server/pdf/credencial";
import { urlBase } from "@/server/url";
import { crearZip } from "@/server/zip";

export const dynamic = "force-dynamic";

async function descargar(seleccion: Seleccion, individual: boolean, seleccionExacta = false) {
  const sel = await seleccionarParaCredencial(seleccion);
  if (seleccionExacta && sel.ids.length !== seleccion.ids?.length) {
    return new Response("La selección cambió. Actualice la lista y vuelva a elegir las fichas.", { status: 409 });
  }
  if (sel.datos.length === 0) {
    return new Response(sel.sinRotulo ? `Falta el rótulo de credencial de ${sel.sinRotulo} personas.` : "No hay credenciales con ese criterio.", { status: 422 });
  }
  const medidas = await medidasCredencial();
  const headers = { "x-excluidas-sin-rotulo": String(sel.sinRotulo), "cache-control": "private, no-store" };
  if (individual && sel.ids.length > 1) {
    const contenido = crearZip(sel.datos.map((ficha, indice) => ({
      nombre: nombrePdfCredencial(sel.personas[indice].junta, ficha.cedula),
      bytes: async () => {
        const pdf = await credencialesIndividuales([ficha], medidas);
        if (indice === sel.ids.length - 1) await marcarGeneradas(sel.ids);
        return pdf;
      },
    })));
    return new Response(contenido, { headers: { ...headers, "content-type": "application/zip", "content-disposition": "attachment; filename=\"credenciales.zip\"" } });
  }
  const bytes = individual ? await credencialesIndividuales(sel.datos, medidas) : await hojasA4(sel.datos, medidas);
  await marcarGeneradas(sel.ids);
  const nombre = individual ? nombrePdfCredencial(sel.personas[0].junta, sel.datos[0].cedula) : "credenciales-a4.pdf";
  return new Response(Buffer.from(bytes), { headers: { ...headers, "content-type": "application/pdf", "content-disposition": `${individual ? "attachment" : "inline"}; filename="${nombre}"` } });
}

// La ficha MJRV conserva su enlace directo al PDF.
export async function GET(request: Request) {
  if (!(await sesionApi("admin"))) return rechazoAdminApi();
  const q = new URL(request.url).searchParams;
  const alcance = q.get("alcance") || (q.has("ids") ? "ids" : "todas");
  if (alcance !== "ids" && alcance !== "todas" && alcance !== "junta" && alcance !== "zona" && alcance !== "sin_generar") {
    return new Response("Alcance no válido.", { status: 400 });
  }
  const ids = alcance === "ids" ? leerIdsCredenciales(q.getAll("ids").flatMap((valor) => valor.split(","))) : null;
  if (alcance === "ids" && !ids) return new Response("Seleccione fichas válidas.", { status: 400 });
  return descargar({ alcance, valor: q.get("valor") ?? undefined, ids: ids ?? undefined }, q.get("formato") === "individual");
}

export async function POST(request: Request) {
  if (!(await sesionApi("admin"))) return rechazoAdminApi();
  const origen = request.headers.get("origin");
  if (origen && (origen === "null" ? request.headers.get("sec-fetch-site") !== "same-origin" : origen !== await urlBase())) {
    return new Response("Origen no autorizado.", { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const formato = form?.get("formato");
  const ids = leerIdsCredenciales(form?.getAll("ids") ?? []);
  if (!ids || (formato !== "individual" && formato !== "a4")) return new Response("Seleccione fichas válidas y un formato.", { status: 400 });
  return descargar({ alcance: "ids", ids }, formato === "individual", true);
}
