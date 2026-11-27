import { generarActa } from "@/server/finanzas";
import { cuentaFinanzas } from "@/server/finanzas-cuenta";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ mjrvId: string }> }) {
  const e = await cuentaFinanzas();
  if (!e.ok) return e.respuesta;
  const id = Number((await params).mjrvId);
  const cuerpo = (await request.json().catch(() => null)) as { verificado?: unknown; modo?: unknown } | null;
  if (!Number.isInteger(id)) return Response.json({ error: "Ficha no válida" }, { status: 400 });
  if (cuerpo?.modo != null && cuerpo.modo !== "prueba" && cuerpo.modo !== "eleccion") return Response.json({ error: "Modo no válido." }, { status: 400 });
  const r = await generarActa(e.actor, id, cuerpo?.verificado === true, { modoEsperado: cuerpo?.modo ?? undefined, paraImprimir: true });
  if (!r.ok) return Response.json({ error: r.mensaje }, { status: r.status });
  const headers = new Headers({ "content-type": "application/pdf", "content-disposition": `inline; filename="acta-${r.numero}.pdf"`,
    "x-acta-borrador": r.borrador ? "1" : "0", "cache-control": "no-store" });
  if (r.actaId !== null) headers.set("x-acta-id", String(r.actaId));
  if (r.version) headers.set("x-acta-version", r.version);
  return new Response(Buffer.from(r.pdf), { headers });
}
