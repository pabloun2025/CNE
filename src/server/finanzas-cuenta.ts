import { CONSUL_Y_FINANCIERO } from "../domain/roles";
import type { Sesion } from "./auth";
import type { ActorPago } from "./finanzas";
import { rechazoAdminApi, sesionApi } from "./guard";
import { urlBase } from "./url";

// La cuenta de financiero o de cónsul actúa en el módulo de pago. No se inventa un operador.
export async function cuentaFinanzas(): Promise<{ ok: true; sesion: Sesion; actor: ActorPago } | { ok: false; respuesta: Response }> {
  const sesion = await sesionApi("admin", CONSUL_Y_FINANCIERO);
  if (!sesion) return { ok: false, respuesta: await rechazoAdminApi() };
  return { ok: true, sesion, actor: { enlaceId: null, operadorId: null, operadorNombre: sesion.nombre, usuarioId: sesion.usuarioId } };
}

export async function origenFormularioFinanzasPermitido(request: Request): Promise<boolean> {
  const origen = request.headers.get("origin");
  // La política no-referrer puede hacer que el navegador envíe Origin: null.
  if (origen === "null") return request.headers.get("sec-fetch-site") === "same-origin";
  return !origen || origen === await urlBase();
}
