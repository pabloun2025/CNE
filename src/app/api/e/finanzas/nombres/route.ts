import { estacionApi } from "@/server/guard";
import { corregirNombres } from "@/server/mjrv";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const e = await estacionApi(["finanzas"]);
  if (!e.ok) return Response.json({ error: "No autorizado" }, { status: e.status });
  const c = (await request.json().catch(() => null)) as { mjrvId?: unknown; apellidos?: unknown; nombres?: unknown } | null;
  const mjrvId = typeof c?.mjrvId === "number" ? c.mjrvId : NaN;
  if (!c || !Number.isInteger(mjrvId) || typeof c.apellidos !== "string" || typeof c.nombres !== "string") {
    return Response.json({ ok: false, mensaje: "Datos incompletos." }, { status: 400 });
  }
  const r = await corregirNombres(
    { tipo: "operador", id: e.sesion.operadorId, nombre: e.sesion.operadorNombre, portal: "finanzas" },
    mjrvId,
    c.apellidos,
    c.nombres,
  );
  return Response.json(r.ok ? { ok: true } : { ok: false, mensaje: r.mensaje });
}
