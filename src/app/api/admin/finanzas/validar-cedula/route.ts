import { DOCUMENTACION_ADMIN } from "@/domain/roles";
import { rechazoAdminApi, sesionApi } from "@/server/guard";
import { validarCedula } from "@/server/mjrv";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sesion = await sesionApi("admin", DOCUMENTACION_ADMIN);
  if (!sesion) return rechazoAdminApi();
  const c = (await request.json().catch(() => null)) as { mjrvId?: unknown; modo?: unknown; version?: unknown } | null;
  const mjrvId = typeof c?.mjrvId === "number" ? c.mjrvId : NaN;
  if (!Number.isSafeInteger(mjrvId) || mjrvId < 1) return Response.json({ ok: false, mensaje: "Datos incompletos." }, { status: 400 });
  const modo = c?.modo;
  if (modo !== undefined && modo !== "prueba" && modo !== "eleccion") return Response.json({ ok: false, mensaje: "Modo no válido." }, { status: 400 });
  const version = c?.version;
  if ((sesion.rol === "validador" || version !== undefined) && (!modo || typeof version !== "string" || !/^[0-9a-f]{64}$/.test(version))) {
    return Response.json({ ok: false, mensaje: "Vuelva a abrir la ficha antes de validar las fotos." }, { status: 400 });
  }
  const r = await validarCedula(
    { tipo: "usuario", id: sesion.usuarioId, nombre: sesion.nombre, portal: "finanzas" },
    mjrvId,
    modo,
    typeof version === "string" ? version : undefined,
  );
  return Response.json(r.ok ? { ok: true } : { ok: false, mensaje: r.mensaje });
}
