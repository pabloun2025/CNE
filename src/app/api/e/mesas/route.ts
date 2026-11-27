import { accesoDirectoEstacion } from "@/server/estaciones";
import { procesarSolicitudMesa } from "@/server/verificacion-mesas-http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const e = await accesoDirectoEstacion(request, "mesas");
  if (!e.ok) return Response.json({ error: "Este enlace no autoriza el puesto de mesa." }, { status: e.status });
  return procesarSolicitudMesa(request, { tipo: "operador", id: e.enlace.id, nombre: e.enlace.etiqueta });
}
