import { MESAS_ADMIN } from "@/domain/roles";
import { rechazoAdminApi, sesionApi } from "@/server/guard";
import { consultarJuntaVerificacion, verificarActuacion } from "@/server/verificacion-mesas";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sesion = await sesionApi("admin", MESAS_ADMIN);
  if (!sesion) return rechazoAdminApi();
  const datos = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const juntaId = datos?.juntaId;
  if (typeof juntaId !== "number" || !Number.isSafeInteger(juntaId) || juntaId < 1) {
    return Response.json({ error: "Elija una junta." }, { status: 400 });
  }
  const cedula = typeof datos?.cedula === "string" ? datos.cedula : "";
  if (datos?.accion === "consultar") {
    const consulta = await consultarJuntaVerificacion(juntaId, cedula);
    return consulta ? Response.json(consulta, { headers: { "cache-control": "private, no-store" } })
      : Response.json({ error: "La junta no existe." }, { status: 404 });
  }
  if (datos?.accion !== "confirmar" || typeof datos.cargo !== "string"
    || (datos.modo !== "prueba" && datos.modo !== "eleccion")
    || (datos.verificacionAnterior !== null && (typeof datos.verificacionAnterior !== "number" || !Number.isSafeInteger(datos.verificacionAnterior)))) {
    return Response.json({ error: "Faltan datos de la actuación." }, { status: 400 });
  }
  const resultado = await verificarActuacion({ tipo: "madrid_admin", id: sesion.usuarioId, nombre: sesion.nombre }, {
    juntaId, cedula, cargo: datos.cargo, modo: datos.modo, verificacionAnterior: datos.verificacionAnterior,
    nombres: typeof datos.nombres === "string" ? datos.nombres : undefined,
    apellidos: typeof datos.apellidos === "string" ? datos.apellidos : undefined,
  });
  return Response.json(resultado, { status: resultado.ok ? 200 : resultado.cambio ? 409 : 400 });
}
