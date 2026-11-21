import type { PoolClient } from "pg";
import { registrarAuditoria } from "./auditoria";
import type { Sesion } from "./auth";
import { withOwnerTx } from "./db";
import { CLAVE_CANDADO_COLA } from "./envios/cola";

export const FRASE_REINICIO_TOTAL = "BORRAR TODO";

export type RecuentoReinicio = { tabla: string; etiqueta: string; n: number }[];
export type ResultadoReinicio =
  | { ok: true; antes: RecuentoReinicio; despues: RecuentoReinicio }
  | { ok: false; mensaje: string; recuentoCambio?: true };

// Son actividades de la jornada (ensayo y elección), nunca las cuentas, los PIN,
// los enlaces de puesto, las 95 juntas, los parámetros ni la auditoría.
const POR_MODO = [
  ["pagos_confirmados", "Pagos confirmados"],
  ["firmas_recibo", "Firmas y recibos digitales"],
  ["pendientes_impresion", "Impresiones pendientes"],
  ["actas_pago", "Recibos de pago emitidos"],
  ["documentos_mjrv", "Fotografías de cédulas"],
  ["cedulas_validadas", "Validaciones de cédula"],
  ["fichas_abiertas_finanzas", "Fichas abiertas en Finanzas"],
  ["escaneos_finanzas", "Escaneos de Finanzas"],
  ["asignaciones_cargo", "Asignaciones de cargos"],
  ["decisiones_movimiento", "Movimientos entre juntas"],
  ["excepciones_disponibilidad", "Excepciones de disponibilidad"],
  ["lecturas_puerta", "Registros de ingreso"],
] as const;

const GLOBALES = [
  ["envios_credencial", "Historial y cola de envíos de credenciales"],
  ["credenciales_revocadas", "Revocaciones de credenciales"],
  ["mjrv", "Fichas MJRV, incluidas las importadas del Excel"],
] as const;

const recuentoCambiado = new Error("recuento cambiado");

// El formulario confirma los recuentos que vio el operador. Se comprueban otra vez bajo bloqueo.
export const revisionReinicio = (resumen: RecuentoReinicio): string => resumen.map(({ n }) => n).join(",");

async function fijarModo(client: PoolClient, modo: "prueba" | "eleccion") {
  await client.query("UPDATE cne.configuracion SET modo = $1 WHERE id = 1", [modo]);
}

// Los recuentos incluyen ambos modos: las tablas de actividad tienen RLS que
// obliga a consultar cada modo por separado, incluso con el rol dueño.
async function contarTodo(client: PoolClient): Promise<RecuentoReinicio> {
  const cantidades = new Map<string, number>();
  for (const [tabla] of POR_MODO) cantidades.set(tabla, 0);
  for (const modo of ["prueba", "eleccion"] as const) {
    await fijarModo(client, modo);
    for (const [tabla] of POR_MODO) {
      const { rows } = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM cne.${tabla} WHERE es_prueba = $1`, [modo === "prueba"],
      );
      cantidades.set(tabla, (cantidades.get(tabla) ?? 0) + rows[0].n);
    }
  }
  for (const [tabla] of GLOBALES) {
    const { rows } = await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM cne.${tabla}`);
    cantidades.set(tabla, rows[0].n);
  }
  return [...POR_MODO, ...GLOBALES].map(([tabla, etiqueta]) => ({
    tabla, etiqueta, n: cantidades.get(tabla) ?? 0,
  }));
}

// Vista previa sin modificaciones: todos los UPDATE quedan anulados por ROLLBACK.
export async function resumenReinicioTotal(): Promise<RecuentoReinicio> {
  const soloLectura = new Error("resumen sin cambios");
  let resumen: RecuentoReinicio = [];
  await withOwnerTx(async (client) => {
    await client.query("SELECT modo FROM cne.configuracion WHERE id = 1 FOR UPDATE");
    resumen = await contarTodo(client);
    throw soloLectura;
  }).catch((e) => { if (e !== soloLectura) throw e; });
  return resumen;
}

// Solo desde superadministración y con confirmación textual explícita.
// No crea ningún respaldo y jamás se ejecuta al desplegar, entrar o cambiar de modo.
export async function reiniciarOperativo(sesion: Sesion, confirmacion: string, revision: string): Promise<ResultadoReinicio> {
  if (sesion.tipo !== "superadmin") throw new Error("Solo la superadministración puede reiniciar el operativo.");
  if (confirmacion.trim() !== FRASE_REINICIO_TOTAL) {
    return { ok: false, mensaje: "Escriba «BORRAR TODO» para confirmar. No se eliminó ningún dato." };
  }

  try {
    return await withOwnerTx(async (client) => {
      // Espera a que termine un intento de envío antes de tocar la cola.
      await client.query("SET LOCAL lock_timeout = '6s'");
      await client.query("SELECT pg_advisory_xact_lock($1)", [CLAVE_CANDADO_COLA]);
      const config = await client.query("SELECT modo FROM cne.configuracion WHERE id = 1 FOR UPDATE");
      if (config.rowCount !== 1) throw new Error("Falta la configuración del operativo");
      // Primero se bloquea el padrón para respetar el orden de los flujos que toman una ficha y luego escriben actividad.
      const hijas = [...POR_MODO, ...GLOBALES].filter(([tabla]) => tabla !== "mjrv").map(([tabla]) => `cne.${tabla}`);
      // No retiene unos bloqueos mientras otra operación necesita adquirirlos para liberar los suyos.
      await client.query(`LOCK TABLE cne.mjrv, ${hijas.join(", ")}, cne.secuencia_recibos IN EXCLUSIVE MODE NOWAIT`);

      const antes = await contarTodo(client);
      if (revisionReinicio(antes) !== revision) throw recuentoCambiado;
      for (const modo of ["prueba", "eleccion"] as const) {
        await fijarModo(client, modo);
        const esPrueba = modo === "prueba";
        // El orden respeta las claves foráneas: pagos y firmas antes de actas.
        for (const [tabla] of POR_MODO) {
          await client.query(`DELETE FROM cne.${tabla} WHERE es_prueba = $1`, [esPrueba]);
        }
        const numeracion = await client.query(
          "UPDATE cne.secuencia_recibos SET ultimo_ordinal = 0 WHERE es_prueba = $1", [esPrueba],
        );
        if (numeracion.rowCount !== 1) throw new Error("Falta una serie de recibos");
      }

      // Estas tablas no están separadas por modo; incluyen también las fichas
      // reales importadas durante los ensayos en modo elección.
      for (const [tabla] of GLOBALES) await client.query(`DELETE FROM cne.${tabla}`);

      const despues = await contarTodo(client);
      if (despues.some((fila) => fila.n !== 0)) {
        throw new Error("Quedaron registros operativos después del borrado.");
      }
      await client.query(
        `UPDATE cne.configuracion
            SET modo = 'eleccion', whatsapp_real = false, correo_real = false,
                whatsapp_proximo_en = NULL, correo_proximo_en = NULL,
                whatsapp_pausa_motivo = NULL, correo_pausa_motivo = NULL,
                actualizado_en = now(), actualizado_por = $1 WHERE id = 1`,
        [sesion.usuarioId],
      );
      await registrarAuditoria({
        portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId,
        actorNombre: sesion.nombre, accion: "reinicio_total_operativo",
        datos: { borrados: Object.fromEntries(antes.map(({ tabla, n }) => [tabla, n])), modo_final: "eleccion", respaldo: false },
      }, client);
      return { ok: true as const, antes, despues };
    });
  } catch (e) {
    if (e === recuentoCambiado) {
      return { ok: false, mensaje: "Cambió el recuento. Revise las cifras actualizadas y vuelva a escribir «BORRAR TODO».", recuentoCambio: true };
    }
    const codigo = (e as { code?: string }).code;
    if (codigo === "55P03" || codigo === "40P01") {
      return { ok: false, mensaje: "Hay actividad en curso. No se eliminó ningún dato. Revise el recuento y vuelva a intentarlo." };
    }
    return { ok: false, mensaje: "El reinicio encontró un error y se revirtió por completo. No se eliminó ningún dato." };
  }
}
