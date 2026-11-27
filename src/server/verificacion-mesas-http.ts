import type { Actor } from "./movimientos";
import { consultarJuntaVerificacion, listarPanoramaJuntas, verificarActuacion } from "./verificacion-mesas";

export async function procesarSolicitudMesa(request: Request, actor: Actor) {
  const datos = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (datos?.accion === "panorama") {
    return Response.json(await listarPanoramaJuntas(), { headers: { "cache-control": "private, no-store" } });
  }
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
  const persona = datos?.personaAnterior as { id?: unknown; juntaId?: unknown; actuacionId?: unknown } | null;
  if (persona !== null && (!persona || typeof persona.id !== "number" || !Number.isSafeInteger(persona.id)
    || typeof persona.juntaId !== "number" || !Number.isSafeInteger(persona.juntaId)
    || (persona.actuacionId !== null && (typeof persona.actuacionId !== "number" || !Number.isSafeInteger(persona.actuacionId))))) {
    return Response.json({ error: "Vuelva a consultar la ficha." }, { status: 400 });
  }
  if (datos?.accion !== "confirmar" || typeof datos.cargo !== "string"
    || (datos.modo !== "prueba" && datos.modo !== "eleccion")
    || (datos.verificacionAnterior !== null && (typeof datos.verificacionAnterior !== "number" || !Number.isSafeInteger(datos.verificacionAnterior)))) {
    return Response.json({ error: "Faltan datos de la actuación." }, { status: 400 });
  }
  const resultado = await verificarActuacion(actor, {
    juntaId, cedula, cargo: datos.cargo, modo: datos.modo, verificacionAnterior: datos.verificacionAnterior,
    personaAnterior: persona ? { id: Number(persona.id), juntaId: Number(persona.juntaId), actuacionId: persona.actuacionId === null ? null : Number(persona.actuacionId) } : null,
    nombres: typeof datos.nombres === "string" ? datos.nombres : undefined,
    apellidos: typeof datos.apellidos === "string" ? datos.apellidos : undefined,
  });
  return Response.json(resultado, { status: resultado.ok ? 200 : resultado.cambio ? 409 : 400 });
}
