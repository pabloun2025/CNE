import { cuentaFinanzas } from "@/server/finanzas-cuenta";
import { loteFirmas } from "@/server/impresion-actas";

export const dynamic = "force-dynamic";

export async function GET() {
  const e = await cuentaFinanzas();
  if (!e.ok) return e.respuesta;
  const pdf = await loteFirmas();
  if (!pdf) return Response.json({ error: "No hay recibos firmados." }, { status: 404 });
  return new Response(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename=\"recibos-firmados.pdf\"", "cache-control": "no-store" } });
}
