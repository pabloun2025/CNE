import { FUNCIONES } from "../domain/estaciones";
import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { listarEnlaces } from "./estaciones";
import { GUIAS, guiaPdf, todasLasGuiasPdf, type ContextoGuias } from "./pdf/guias";
import { urlBase } from "./url";
import { crearZip } from "./zip";

// Enlace activo más reciente de cada función (listarEnlaces ya ordena por activo e id descendente).
export async function contextoGuias(): Promise<ContextoGuias> {
  const enlaces: ContextoGuias["enlaces"] = {};
  for (const e of await listarEnlaces()) {
    if (e.activo && e.token && !enlaces[e.funcion]) enlaces[e.funcion] = { etiqueta: e.etiqueta, token: e.token };
  }
  return { base: await urlBase(), enlaces };
}

type SeleccionGuia = number | "todas" | "zip";

export function leerGuia(valor: string): SeleccionGuia | null {
  if (valor === "todas" || valor === "zip") return valor;
  const n = /^[1-9]$/.test(valor) ? Number(valor) : 0;
  return n >= 1 && n <= GUIAS.length ? n : null;
}

// La auditoría guarda qué guía y cuántos puestos tenían enlace; nunca el enlace ni su token.
export async function descargarGuia(sesion: Sesion, guia: SeleccionGuia) {
  const ctx = await contextoGuias();
  const base = "guias-rapidas-cne-madrid";
  const descarga = guia === "zip"
    ? {
        cuerpo: crearZip(await Promise.all(GUIAS.map(async (g) => ({ nombre: `${g.archivo}.pdf`, bytes: await guiaPdf(g.n, ctx) })))),
        nombre: `${base}.zip`,
        tipo: "application/zip",
      }
    : {
        cuerpo: Buffer.from(guia === "todas" ? await todasLasGuiasPdf(ctx) : await guiaPdf(guia, ctx)),
        nombre: guia === "todas" ? `${base}.pdf` : `${GUIAS[guia - 1].archivo}.pdf`,
        tipo: "application/pdf",
      };
  await registrarAuditoria({
    portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre,
    accion: "guia_descargada", entidad: "guias", datos: { guia, funcionesConEnlace: FUNCIONES.filter((f) => ctx.enlaces[f]).length },
  });
  return descarga;
}
