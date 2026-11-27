import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { CATEGORIAS_LIMPIEZA, FRASE_PREPARAR, normalizarFrase } from "../domain/limpieza";
import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { withOwnerTx } from "./db";
import { crearRespaldo, type Respaldador, type Respaldo } from "./respaldo";

export type Recuento = { tabla: string; etiqueta: string; n: number }[];
export type ResultadoPreparar =
  | { ok: true; lote: string; antes: Recuento; despues: Recuento; respaldo: Respaldo; modoAnterior: string }
  | { ok: false; mensaje: string };

function exigirSuperadmin(sesion: Sesion): void {
  if (sesion.tipo !== "superadmin") throw new Error("Solo la superadministración puede hacer esto.");
}

// Cada tabla se acota a «lo que es de prueba»: nunca se borra una fila con es_prueba = false.
const DE_PRUEBA: Record<string, string> = {
  pagos_confirmados: "es_prueba", actas_pago: "es_prueba", documentos_mjrv: "es_prueba", decisiones_movimiento: "es_prueba",
  excepciones_disponibilidad: "es_prueba", lecturas_puerta: "es_prueba", fichas_abiertas_finanzas: "es_prueba", asignaciones_cargo: "es_prueba",
  escaneos_finanzas: "es_prueba", cedulas_validadas: "es_prueba", pendientes_impresion: "es_prueba", firmas_recibo: "es_prueba", ausencias_mesa: "es_prueba",
  envios_credencial: "mjrv_id IN (SELECT id FROM cne.mjrv WHERE es_prueba)",
  mjrv: "es_prueba",
};

async function contar(client: PoolClient): Promise<Recuento> {
  const r: Recuento = [];
  for (const c of CATEGORIAS_LIMPIEZA) {
    const f = await client.query(`SELECT count(*)::int AS n FROM cne.${c.tabla} WHERE ${DE_PRUEBA[c.tabla]}`);
    r.push({ ...c, n: f.rows[0].n });
  }
  return r;
}

// Las tablas de actividad filtran por modo (RLS). Para ver y borrar el ensayo hay que estar en modo prueba: dentro de la transacción
// se pone ese modo; nadie más lo ve hasta el COMMIT, y si algo falla vuelve a su valor con el ROLLBACK.
async function verEnsayo(client: PoolClient): Promise<string> {
  const modo = (await client.query("SELECT modo FROM cne.configuracion WHERE id = 1 FOR UPDATE")).rows[0].modo as string;
  await client.query("UPDATE cne.configuracion SET modo = 'prueba' WHERE id = 1");
  return modo;
}

// Resumen previo (§14.3 paso 1). No cambia nada.
export async function resumenLimpieza(): Promise<Recuento> {
  const CANCELAR = new Error("solo lectura");
  let resumen: Recuento = [];
  await withOwnerTx(async (client) => {
    await verEnsayo(client);
    resumen = await contar(client);
    throw CANCELAR;
  }).catch((e) => { if (e !== CANCELAR) throw e; });
  return resumen;
}

export async function prepararEleccion(sesion: Sesion, confirmacion: string, respaldador: Respaldador = crearRespaldo): Promise<ResultadoPreparar> {
  exigirSuperadmin(sesion);
  if (normalizarFrase(confirmacion) !== FRASE_PREPARAR) return { ok: false, mensaje: "Escriba «PREPARAR ELECCIÓN» para confirmar. No se hizo ningún cambio." };

  // 1) Respaldo comprobable. Si falla, no se limpia nada.
  let respaldo: Respaldo;
  try {
    respaldo = await respaldador();
  } catch (e) {
    return { ok: false, mensaje: `${(e as Error).message} No se limpió nada.` };
  }

  // 2) Limpieza en una sola transacción: copia a respaldo_limpieza, comprueba, borra, pasa a modo elección.
  const lote = randomUUID();
  try {
    return await withOwnerTx(async (client) => {
      const modoAnterior = await verEnsayo(client);
      const antes = await contar(client);
      for (const c of antes) {
        // Los binarios de las fotos no se duplican aquí: están en el respaldo pg_dump.
        const fila = c.tabla === "documentos_mjrv" ? "to_jsonb(t) - 'imagen_cifrada' - 'nonce'"
          : c.tabla === "firmas_recibo" ? "to_jsonb(t) - 'pdf'"
          : c.tabla === "actas_pago" ? "to_jsonb(t) - 'recibo_cifrado' - 'recibo_nonce'"
          : "to_jsonb(t)";
        await client.query(`INSERT INTO cne.respaldo_limpieza (lote, tabla, fila) SELECT $1, $2, ${fila} FROM cne.${c.tabla} t WHERE ${DE_PRUEBA[c.tabla]}`, [lote, c.tabla]);
        const copiadas = (await client.query("SELECT count(*)::int AS n FROM cne.respaldo_limpieza WHERE lote = $1 AND tabla = $2", [lote, c.tabla])).rows[0].n;
        if (copiadas !== c.n) throw new Error(`La copia de ${c.tabla} no coincide (${copiadas} de ${c.n}).`);
      }
      for (const c of antes) await client.query(`DELETE FROM cne.${c.tabla} WHERE ${DE_PRUEBA[c.tabla]}`);
      await client.query("UPDATE cne.secuencia_recibos SET ultimo_ordinal = 0 WHERE es_prueba");
      const despues = await contar(client);
      if (despues.some((d) => d.n !== 0)) throw new Error("Quedaron registros de prueba después de borrar.");
      await client.query("UPDATE cne.configuracion SET modo = 'eleccion', actualizado_en = now(), actualizado_por = $1 WHERE id = 1", [sesion.usuarioId]);
      await registrarAuditoria({
        portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "eleccion_preparada", entidad: "configuracion", entidadId: 1,
        datos: { lote, modo_anterior: modoAnterior, respaldo: respaldo.archivo, borrados: Object.fromEntries(antes.map((a) => [a.tabla, a.n])) },
      }, client);
      return { ok: true as const, lote, antes, despues, respaldo, modoAnterior };
    });
  } catch (e) {
    return { ok: false, mensaje: `No se limpió nada: ${(e as Error).message}` };
  }
}
