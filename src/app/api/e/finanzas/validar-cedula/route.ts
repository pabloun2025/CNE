import { estacionApi } from "@/server/guard";
import { validarCedula } from "@/server/mjrv";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const e = await estacionApi(["finanzas"]);
  if (!e.ok) return Response.json({ error: "No autorizado" }, { status: e.status });
  const c = (await request.json().catch(() => null)) as { mjrvId?: unknown } | null;
  const mjrvId = typeof c?.mjrvId === "number" ? c.mjrvId : NaN;
  if (!Number.isInteger(mjrvId)) return Response.json({ ok: false, mensaje: "Datos incompletos." }, { status: 400 });
  const r = await validarCedula(
    { tipo: "operador", id: e.sesion.operadorId, nombre: e.sesion.operadorNombre, portal: "finanzas" },
    mjrvId,
  );
  return Response.json(r.ok ? { ok: true } : { ok: false, mensaje: r.mensaje });
}
