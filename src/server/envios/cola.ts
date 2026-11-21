import type { PoolClient } from "pg";
import { dentroDeHorario, FALLOS_PARA_PAUSAR, pausaAlAzarMs, TOPE_DIARIO, type CanalEnvio } from "../../domain/envios-ritmo";
import { getAppPool } from "../db";
import { clientesPorDefecto, INICIO_DIA_MADRID, leerConfigEnvios, remitenteEfectivo, type Clientes } from "../envios-config";
import { mensajeCredencial } from "../envios";
import { seleccionarParaCredencial } from "../credenciales";
import { medidasCredencial } from "../credencial-config";
import { credencialesIndividuales } from "../pdf/credencial";
import type { ResultadoProveedor } from "./http";

// Cola de envío real (09 §3.7). Procesa como mucho UN mensaje por canal y vuelta; la pausa al azar entre mensajes se guarda
// en la base (`<canal>_proximo_en`), así sobrevive a reinicios. Las fichas de prueba nunca salen por aquí.
export type ResultadoCanal = { accion: "enviado" | "fallo" | "omitido" | "pausado" | "candado"; motivo?: string };
export type OpcionesCola = { ahora?: Date; azar?: () => number; clientes?: Clientes; canales?: CanalEnvio[] };

const CLAVE_CANDADO = 4343;
export const MENSAJE_INTERRUMPIDO = "Interrumpido: no se sabe si salió. Reintente si no le llegó.";

// Nunca se reenvía a ciegas: una fila que quedó «en cola» ya intentada (intentos = 1) al arrancar pasa a fallo.
export async function recuperarInterrumpidas(): Promise<number> {
  const pool = await getAppPool();
  const r = await pool.query("UPDATE envios_credencial SET estado = 'fallo', error = $1 WHERE estado = 'en_cola' AND intentos = 1 AND NOT simulado", [MENSAJE_INTERRUMPIDO]);
  return r.rowCount ?? 0;
}

export async function procesarCola(opciones: OpcionesCola = {}): Promise<Record<CanalEnvio, ResultadoCanal>> {
  const ahora = opciones.ahora ?? new Date();
  const azar = opciones.azar ?? Math.random;
  const canales = opciones.canales ?? (["whatsapp", "correo"] as CanalEnvio[]);
  const resultado: Record<CanalEnvio, ResultadoCanal> = { whatsapp: { accion: "omitido", motivo: "no tocaba" }, correo: { accion: "omitido", motivo: "no tocaba" } };
  const pool = await getAppPool();
  const client = await pool.connect();
  try {
    // Un solo proceso a la vez: candado de sesión (se libera solo si la conexión se corta).
    const tengo = (await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [CLAVE_CANDADO])).rows[0].ok;
    if (!tengo) {
      for (const c of canales) resultado[c] = { accion: "candado", motivo: "otro proceso está enviando" };
      return resultado;
    }
    try {
      const clientes = opciones.clientes ?? clientesPorDefecto();
      for (const canal of canales) resultado[canal] = await procesarCanal(client, canal, ahora, azar, clientes);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [CLAVE_CANDADO]);
    }
  } finally {
    client.release();
  }
  return resultado;
}

const COL = {
  whatsapp: { real: "whatsapp_real", proximo: "whatsapp_proximo_en", pausa: "whatsapp_pausa_motivo" },
  correo: { real: "correo_real", proximo: "correo_proximo_en", pausa: "correo_pausa_motivo" },
} as const;

async function pausar(client: PoolClient, canal: CanalEnvio, motivo: string): Promise<ResultadoCanal> {
  await client.query(`UPDATE configuracion SET ${COL[canal].pausa} = $1 WHERE id = 1`, [motivo]);
  return { accion: "pausado", motivo };
}

async function procesarCanal(client: PoolClient, canal: CanalEnvio, ahora: Date, azar: () => number, clientes: Clientes): Promise<ResultadoCanal> {
  const col = COL[canal];
  const cfg = (await client.query<{ real: boolean; proximo: Date | null; pausa: string | null }>(`SELECT ${col.real} AS real, ${col.proximo} AS proximo, ${col.pausa} AS pausa FROM configuracion WHERE id = 1`)).rows[0];
  if (!cfg.real) return { accion: "omitido", motivo: "interruptor apagado" };
  if (cfg.pausa) return { accion: "pausado", motivo: cfg.pausa };
  if (!dentroDeHorario(ahora)) return { accion: "omitido", motivo: "fuera de horario" };
  if (cfg.proximo && ahora < cfg.proximo) return { accion: "omitido", motivo: "esperando la pausa entre envíos" };

  const hoy = (await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM envios_credencial WHERE canal = $1 AND estado = 'enviada_al_servicio' AND NOT simulado AND enviado_en >= ${INICIO_DIA_MADRID}`, [canal, ahora.toISOString()])).rows[0].n;
  if (hoy >= TOPE_DIARIO[canal]) return { accion: "omitido", motivo: "tope diario alcanzado" };

  const hay = (await client.query(
    `SELECT 1 FROM envios_credencial e JOIN mjrv m ON m.id = e.mjrv_id WHERE e.canal = $1 AND e.estado = 'en_cola' AND NOT e.simulado AND e.intentos = 0 AND NOT m.es_prueba LIMIT 1`, [canal])).rowCount;
  if (!hay) return { accion: "omitido", motivo: "cola vacía" };
  if (clientes[canal].simulado) return pausar(client, canal, canal === "whatsapp" ? "Falta la configuración de Evolution API." : "Falta la clave de Brevo.");

  if (canal === "whatsapp") {
    try {
      if ((await clientes.whatsapp.resumen()).estado !== "open") return pausar(client, canal, "La línea de WhatsApp no está vinculada.");
    } catch {
      await client.query(`UPDATE configuracion SET ${col.proximo} = $1 WHERE id = 1`, [new Date(ahora.getTime() + 30_000)]);
      return { accion: "omitido", motivo: "Evolution API no responde" };
    }
  }
  const remitente = remitenteEfectivo(await leerConfigEnvios());
  if (canal === "correo" && (!remitente.direccion || !remitente.nombre)) return pausar(client, canal, "Falta el remitente del correo.");

  // Reclamo atómico: una sola fila, marcada como intentada antes de enviar.
  const fila = (await client.query<{ id: number; mjrv_id: number; destino: string }>(
    `UPDATE envios_credencial SET intentos = 1 WHERE id = (
       SELECT e.id FROM envios_credencial e JOIN mjrv m ON m.id = e.mjrv_id
        WHERE e.canal = $1 AND e.estado = 'en_cola' AND NOT e.simulado AND e.intentos = 0 AND NOT m.es_prueba
        ORDER BY e.id FOR UPDATE OF e SKIP LOCKED LIMIT 1)
     RETURNING id, mjrv_id, destino`, [canal])).rows[0];
  if (!fila) return { accion: "omitido", motivo: "cola vacía" };

  let r: ResultadoProveedor;
  try {
    const sel = await seleccionarParaCredencial({ alcance: "ids", ids: [fila.mjrv_id] });
    if (sel.datos.length === 0) r = { ok: false, permanente: true, error: "La ficha está de baja o le falta el rótulo de la credencial." };
    else {
      const d = sel.datos[0];
      const m = mensajeCredencial(d, canal, sel.personas[0].junta);
      // El interruptor autoriza credenciales definitivas para fichas reales incluso durante el ensayo operativo.
      const pdfBase64 = Buffer.from(await credencialesIndividuales([{ ...d, prueba: false }], await medidasCredencial())).toString("base64");
      const actual = (await client.query<{ destino: string | null }>(
        "SELECT CASE WHEN $2 = 'whatsapp' THEN telefono_e164 ELSE correo END AS destino FROM mjrv WHERE id = $1 AND activo AND NOT es_prueba",
        [fila.mjrv_id, canal])).rows[0];
      if (actual?.destino !== fila.destino) {
        r = { ok: false, permanente: true, error: "El contacto o la ficha cambió después de ponerla en cola. Revise la ficha y vuelva a encolarla." };
      } else if (canal === "whatsapp") {
        r = await clientes.whatsapp.enviarDocumento({ numero: fila.destino, texto: m.texto, nombreArchivo: m.nombreArchivo, pdfBase64 });
      } else {
        r = await clientes.correo.enviar({ para: fila.destino, asunto: m.asunto, texto: m.texto, html: m.html, remitente, adjunto: { nombre: m.nombreArchivo, base64: pdfBase64 } });
      }
    }
  } catch (e) {
    r = { ok: false, permanente: false, incierto: true, error: `Error al enviar: ${(e as Error).message}`.slice(0, 200) };
  }

  // «enviado_en» es el momento del intento (también en los fallos): sirve para contar los fallos seguidos.
  if (r.ok) {
    await client.query("UPDATE envios_credencial SET estado = 'enviada_al_servicio', id_externo = $2, enviado_en = $3 WHERE id = $1", [fila.id, r.idExterno, ahora]);
  } else {
    await client.query("UPDATE envios_credencial SET estado = 'fallo', error = $2, enviado_en = $3 WHERE id = $1", [fila.id, r.error.slice(0, 300), ahora]);
  }
  await client.query(`UPDATE configuracion SET ${col.proximo} = $1 WHERE id = 1`, [new Date(ahora.getTime() + pausaAlAzarMs(canal, azar))]);

  if (!r.ok) {
    // Pausa tras N fallos seguidos desde la última reanudación.
    const ultimos = (await client.query<{ estado: string }>(
      `SELECT estado FROM envios_credencial
        WHERE canal = $1 AND NOT simulado AND estado IN ('enviada_al_servicio','fallo')
          AND enviado_en > coalesce((SELECT max(creado_en) FROM auditoria WHERE accion = 'envios_reanudados' AND datos->>'canal' = $1), '-infinity')
        ORDER BY enviado_en DESC, id DESC LIMIT $2`, [canal, FALLOS_PARA_PAUSAR])).rows;
    if (ultimos.length === FALLOS_PARA_PAUSAR && ultimos.every((u) => u.estado === "fallo")) await pausar(client, canal, `${FALLOS_PARA_PAUSAR} fallos seguidos. Revise la conexión y reanude.`);
    return { accion: "fallo", motivo: r.error };
  }
  return { accion: "enviado" };
}
