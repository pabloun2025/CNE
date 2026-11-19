import { CONSUL_Y_FINANCIERO } from "../domain/roles";
import type { Sesion } from "./auth";
import type { ActorPago } from "./finanzas";
import { rechazoAdminApi, sesionApi } from "./guard";

// La cuenta de financiero o de cónsul actúa en el módulo de pago. No se inventa un operador.
export async function cuentaFinanzas(): Promise<{ ok: true; sesion: Sesion; actor: ActorPago } | { ok: false; respuesta: Response }> {
  const sesion = await sesionApi("admin", CONSUL_Y_FINANCIERO);
  if (!sesion) return { ok: false, respuesta: await rechazoAdminApi() };
  return { ok: true, sesion, actor: { enlaceId: null, operadorId: null, operadorNombre: sesion.nombre, usuarioId: sesion.usuarioId } };
}
