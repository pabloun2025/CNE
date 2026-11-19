import { guardarDocumento, type Lado } from "@/server/documentos";
import { cuentaFinanzas } from "@/server/finanzas-cuenta";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const e = await cuentaFinanzas();
  if (!e.ok) return e.respuesta;
  const f = await request.formData().catch(() => null);
  const lado = f?.get("lado"), id = Number(f?.get("mjrvId")), imagen = f?.get("imagen");
  if (!f || (lado !== "anverso" && lado !== "reverso") || !Number.isInteger(id) || !(imagen instanceof File)) return Response.json({ error: "Datos incompletos." }, { status: 400 });
  const r = await guardarDocumento({ mjrvId: id, lado: lado as Lado, imagen: Buffer.from(await imagen.arrayBuffer()), origen: "estacion" });
  return r.ok ? Response.json({ ok: true, ...r.estado }) : Response.json({ error: r.mensaje }, { status: r.status });
}
