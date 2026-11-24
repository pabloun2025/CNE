import { esLadoDocumento } from "@/domain/documentos";
import { guardarDocumento } from "@/server/documentos";
import { cuentaFinanzas, origenFormularioFinanzasPermitido } from "@/server/finanzas-cuenta";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const e = await cuentaFinanzas();
  if (!e.ok) return e.respuesta;
  if (!await origenFormularioFinanzasPermitido(request)) return Response.json({ error: "Origen no autorizado." }, { status: 403 });
  const f = await request.formData().catch(() => null);
  const lado = f?.get("lado"), id = Number(f?.get("mjrvId")), imagen = f?.get("imagen");
  if (!f || !esLadoDocumento(lado) || !Number.isInteger(id) || id < 1 || !(imagen instanceof File)) return Response.json({ error: "Datos incompletos." }, { status: 400 });
  const modo = f.get("modo");
  if (modo !== null && modo !== "prueba" && modo !== "eleccion") return Response.json({ error: "Modo no válido." }, { status: 400 });
  const r = await guardarDocumento({ mjrvId: id, lado, imagen: Buffer.from(await imagen.arrayBuffer()), origen: "estacion", modoEsperado: modo ?? undefined });
  return r.ok ? Response.json({ ok: true, ...r.estado }) : Response.json({ error: r.mensaje }, { status: r.status });
}
