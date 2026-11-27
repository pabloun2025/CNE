import { CAPTURA_ADMIN } from "@/domain/roles";
import { rechazoAdminApi, sesionApi } from "@/server/guard";
import { esLadoDocumento } from "@/domain/documentos";
import { borrarFotoDocumento, guardarDocumento } from "@/server/documentos";
import { origenFormularioFinanzasPermitido } from "@/server/finanzas-cuenta";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!await sesionApi("admin", CAPTURA_ADMIN)) return rechazoAdminApi();
  if (!await origenFormularioFinanzasPermitido(request)) return Response.json({ error: "Origen no autorizado." }, { status: 403 });
  const f = await request.formData().catch(() => null);
  const lado = f?.get("lado"), id = Number(f?.get("mjrvId")), imagen = f?.get("imagen");
  if (!f || !esLadoDocumento(lado) || !Number.isInteger(id) || id < 1 || !(imagen instanceof File)) return Response.json({ error: "Datos incompletos." }, { status: 400 });
  const modo = f.get("modo");
  if (modo !== null && modo !== "prueba" && modo !== "eleccion") return Response.json({ error: "Modo no válido." }, { status: 400 });
  const r = await guardarDocumento({ mjrvId: id, lado, imagen: Buffer.from(await imagen.arrayBuffer()), origen: "estacion", modoEsperado: modo ?? undefined });
  return r.ok ? Response.json({ ok: true, ...r.estado }) : Response.json({ error: r.mensaje }, { status: r.status });
}

export async function DELETE(request: Request) {
  const sesion = await sesionApi("admin", CAPTURA_ADMIN);
  if (!sesion) return rechazoAdminApi();
  if (!await origenFormularioFinanzasPermitido(request)) return Response.json({ error: "Origen no autorizado." }, { status: 403 });
  const { mjrvId, lado, modo, version, juntaId } = (await request.json().catch(() => null) ?? {}) as Record<string, unknown>;
  const mesas = sesion.rol === "verificador_mesas";
  if (typeof mjrvId !== "number" || !Number.isSafeInteger(mjrvId) || mjrvId < 1 || !esLadoDocumento(lado)
    || (modo !== "prueba" && modo !== "eleccion") || typeof version !== "string" || !/^[0-9a-f]{64}$/.test(version)
    || (mesas && (typeof juntaId !== "number" || !Number.isSafeInteger(juntaId) || juntaId < 1))) {
    return Response.json({ error: "Vuelva a abrir la ficha antes de borrar." }, { status: 400 });
  }
  const r = await borrarFotoDocumento({ tipo: "usuario", id: sesion.usuarioId, nombre: sesion.nombre },
    { id: mjrvId, lado, modo, version, juntaId: mesas && typeof juntaId === "number" ? juntaId : undefined });
  return r.ok ? Response.json({ ok: true, ...r.estado }, { headers: { "cache-control": "private, no-store" } })
    : Response.json({ error: r.mensaje }, { status: r.status });
}
