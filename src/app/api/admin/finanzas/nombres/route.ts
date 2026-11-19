import { cuentaFinanzas } from "@/server/finanzas-cuenta";
import { corregirNombres } from "@/server/mjrv";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const e = await cuentaFinanzas();
  if (!e.ok) return e.respuesta;
  const c = (await request.json().catch(() => null)) as { mjrvId?: unknown; apellidos?: unknown; nombres?: unknown } | null;
  const mjrvId = typeof c?.mjrvId === "number" ? c.mjrvId : NaN;
  if (!c || !Number.isInteger(mjrvId) || typeof c.apellidos !== "string" || typeof c.nombres !== "string") {
    return Response.json({ ok: false, mensaje: "Datos incompletos." }, { status: 400 });
  }
  const r = await corregirNombres(
    { tipo: "usuario", id: e.sesion.usuarioId, nombre: e.sesion.nombre, portal: "finanzas" },
    mjrvId, c.apellidos, c.nombres,
  );
  return Response.json(r.ok ? { ok: true } : { ok: false, mensaje: r.mensaje });
}
