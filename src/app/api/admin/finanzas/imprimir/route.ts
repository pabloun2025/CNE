import { cuentaFinanzas } from "@/server/finanzas-cuenta";
import { imprimirPendiente } from "@/server/impresion-actas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const e = await cuentaFinanzas();
  if (!e.ok) return e.respuesta;
  const c = (await request.json().catch(() => null)) as { id?: unknown } | null;
  if (!c || !Number.isInteger(c.id)) return Response.json({ error: "Falta el pendiente." }, { status: 400 });
  const r = await imprimirPendiente(e.actor, c.id as number);
  if (!r.ok) return Response.json({ error: r.mensaje }, { status: 409 });
  return new Response(Buffer.from(r.pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="acta-${r.junta}.pdf"`, "cache-control": "no-store" } });
}
