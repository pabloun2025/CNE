import { cuentaFinanzas } from "@/server/finanzas-cuenta";
import { guardarFirma } from "@/server/impresion-actas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const e = await cuentaFinanzas();
  if (!e.ok) return e.respuesta;
  const f = await request.formData().catch(() => null);
  const id = Number(f?.get("mjrvId"));
  const firma = f?.get("firma");
  if (!f || !Number.isInteger(id) || !(firma instanceof File)) return Response.json({ ok: false, mensaje: "Falta la firma." }, { status: 400 });
  const r = await guardarFirma(e.actor, id, Buffer.from(await firma.arrayBuffer()));
  return Response.json(r.ok ? { ok: true } : { ok: false, mensaje: r.mensaje });
}
