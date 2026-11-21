import { esLadoDocumento } from "@/domain/documentos";
import { buscarPorCedula, guardarDocumento, ipDeSolicitud, permitirPublico } from "@/server/documentos";

export const dynamic = "force-dynamic";

// El público sube una foto; nunca vuelve a verla (no hay ruta pública de lectura).
export async function POST(request: Request) {
  if (!(await permitirPublico(ipDeSolicitud(request.headers), "foto"))) return Response.json({ error: "Demasiados envíos. Espere unos minutos o pida ayuda al personal." }, { status: 429 });
  const f = await request.formData().catch(() => null);
  const lado = f?.get("lado"), cedula = f?.get("cedula"), imagen = f?.get("imagen");
  if (!f || !esLadoDocumento(lado) || typeof cedula !== "string" || !(imagen instanceof File)) return Response.json({ error: "Datos incompletos." }, { status: 400 });
  const m = await buscarPorCedula(cedula);
  if (!m) return Response.json({ error: "No encontramos ese número de cédula." }, { status: 404 });
  const r = await guardarDocumento({ mjrvId: m.mjrvId, lado, imagen: Buffer.from(await imagen.arrayBuffer()), origen: "publico" });
  return r.ok ? Response.json({ ok: true, ...r.estado }) : Response.json({ error: r.mensaje }, { status: r.status });
}
