import { marcarGeneradas, seleccionarParaCredencial, type Seleccion } from "@/server/credenciales";
import { sesionApi } from "@/server/guard";
import { credencialesIndividuales, hojasA4 } from "@/server/pdf/credencial";

export const dynamic = "force-dynamic";

// GET /admin/credenciales/pdf?formato=individual|a4&alcance=…&valor=…&ids=1,2
export async function GET(request: Request) {
  if (!(await sesionApi("admin"))) return new Response("No autorizado", { status: 401 });
  const q = new URL(request.url).searchParams;
  const alcance = (q.get("alcance") || (q.get("ids") ? "ids" : "todas")) as Seleccion["alcance"];
  if (!["ids", "todas", "junta", "zona", "sin_generar"].includes(alcance)) return new Response("Alcance no válido", { status: 400 });
  const ids = (q.get("ids") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 3000);
  const sel = await seleccionarParaCredencial({ alcance, valor: q.get("valor") ?? undefined, ids });
  if (sel.datos.length === 0) {
    return new Response(sel.sinRotulo ? `Falta el rótulo de credencial de ${sel.sinRotulo} personas.` : "No hay fichas que imprimir con ese criterio.", { status: 422 });
  }
  const individual = q.get("formato") === "individual";
  const bytes = individual ? await credencialesIndividuales(sel.datos) : await hojasA4(sel.datos);
  await marcarGeneradas(sel.ids);
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="credenciales-${individual ? "individuales" : "a4"}.pdf"`,
      "x-excluidas-sin-rotulo": String(sel.sinRotulo),
      "cache-control": "no-store",
    },
  });
}
