import { esLadoDocumento } from "@/domain/documentos";
import { guardarDocumento } from "@/server/documentos";
import { cuentaFinanzas } from "@/server/finanzas-cuenta";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const e = await cuentaFinanzas();
  if (!e.ok) return e.respuesta;
  const f = await request.formData().catch(() => null);
  const lado = f?.get("lado"), id = Number(f?.get("mjrvId")), imagen = f?.get("imagen");
  if (!f || !esLadoDocumento(lado) || !Number.isInteger(id) || id < 1 || !(imagen instanceof File)) return Response.json({ error: "Datos incompletos." }, { status: 400 });
  const numeroPasaporte = f.get("numeroPasaporte");
  const r = await guardarDocumento({ mjrvId: id, lado, numeroPasaporte: typeof numeroPasaporte === "string" ? numeroPasaporte : undefined, imagen: Buffer.from(await imagen.arrayBuffer()), origen: "estacion" });
  return r.ok ? Response.json({ ok: true, ...r.estado }) : Response.json({ error: r.mensaje }, { status: r.status });
}
