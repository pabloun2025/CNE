import { cuentaFinanzas } from "@/server/finanzas-cuenta";
import { validarCedula } from "@/server/mjrv";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const e = await cuentaFinanzas();
  if (!e.ok) return e.respuesta;
  const c = (await request.json().catch(() => null)) as { mjrvId?: unknown; modo?: unknown } | null;
  const mjrvId = typeof c?.mjrvId === "number" ? c.mjrvId : NaN;
  if (!Number.isInteger(mjrvId)) return Response.json({ ok: false, mensaje: "Datos incompletos." }, { status: 400 });
  const modo = c?.modo;
  if (modo !== undefined && modo !== "prueba" && modo !== "eleccion") return Response.json({ ok: false, mensaje: "Modo no válido." }, { status: 400 });
  const r = await validarCedula(
    { tipo: "usuario", id: e.sesion.usuarioId, nombre: e.sesion.nombre, portal: "finanzas" },
    mjrvId,
    modo,
  );
  return Response.json(r.ok ? { ok: true } : { ok: false, mensaje: r.mensaje });
}
