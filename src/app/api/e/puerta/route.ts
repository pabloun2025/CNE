import { estacionApi } from "@/server/guard";
import { comprobarCredencial, contadoresPuerta, registrarLectura } from "@/server/puerta";

export const dynamic = "force-dynamic";

export async function GET() {
  const e = await estacionApi(["puerta"]);
  if (!e.ok) return Response.json({ error: "No autorizado" }, { status: e.status });
  return Response.json(await contadoresPuerta(e.sesion.enlaceId));
}

export async function POST(request: Request) {
  const e = await estacionApi(["puerta"]);
  if (!e.ok) return Response.json({ error: "No autorizado" }, { status: e.status });
  const cuerpo = (await request.json().catch(() => null)) as { codigo?: unknown; dispositivo?: unknown; origen?: unknown; confirmarId?: unknown } | null;
  if (!cuerpo || typeof cuerpo.codigo !== "string" || !cuerpo.codigo.trim()) return Response.json({ error: "Falta el código" }, { status: 400 });
  const dispositivo = typeof cuerpo.dispositivo === "string" ? cuerpo.dispositivo : null;
  const { confirmarId } = cuerpo;
  if (confirmarId !== undefined && (typeof confirmarId !== "number" || !Number.isSafeInteger(confirmarId) || confirmarId < 1)) {
    return Response.json({ error: "Identificación inválida" }, { status: 400 });
  }
  const lectura = cuerpo.origen === "credencial" || cuerpo.origen === "nombre"
    ? await comprobarCredencial(e.sesion, cuerpo.codigo, dispositivo, confirmarId)
    : await registrarLectura(e.sesion, cuerpo.codigo, dispositivo, cuerpo.origen === "cedula" ? "cedula" : "codigo");
  return Response.json({ lectura, contadores: await contadoresPuerta(e.sesion.enlaceId) });
}
