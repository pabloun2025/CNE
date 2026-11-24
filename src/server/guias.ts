import { FUNCIONES } from "../domain/estaciones";
import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { listarEnlaces } from "./estaciones";
import { GUIAS, guiaPdf, todasLasGuiasPdf, type ContextoGuias } from "./pdf/guias";
import { urlBase } from "./url";

// Enlace activo más reciente de cada función (listarEnlaces ya ordena por activo e id descendente).
export async function contextoGuias(): Promise<ContextoGuias> {
  const enlaces: ContextoGuias["enlaces"] = {};
  for (const e of await listarEnlaces()) {
    if (e.activo && e.token && !enlaces[e.funcion]) enlaces[e.funcion] = { etiqueta: e.etiqueta, token: e.token };
  }
  return { base: await urlBase(), enlaces };
}

export function leerGuia(valor: string): number | "todas" | null {
  if (valor === "todas") return "todas";
  const n = /^[1-9]$/.test(valor) ? Number(valor) : 0;
  return n >= 1 && n <= GUIAS.length ? n : null;
}

// La auditoría guarda qué guía y cuántos puestos tenían enlace; nunca el enlace ni su token.
export async function descargarGuia(sesion: Sesion, guia: number | "todas"): Promise<{ bytes: Uint8Array; nombre: string }> {
  const ctx = await contextoGuias();
  const bytes = guia === "todas" ? await todasLasGuiasPdf(ctx) : await guiaPdf(guia, ctx);
  await registrarAuditoria({
    portal: sesion.tipo === "superadmin" ? "superadmin" : "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre,
    accion: "guia_descargada", entidad: "guias", datos: { guia, funcionesConEnlace: FUNCIONES.filter((f) => ctx.enlaces[f]).length },
  });
  return { bytes, nombre: guia === "todas" ? "guias-rapidas-cne-madrid.pdf" : `${GUIAS[guia - 1].archivo}.pdf` };
}
