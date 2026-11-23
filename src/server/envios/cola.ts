import type { PoolClient } from "pg";
import { FALLOS_PARA_PAUSAR, pausaWhatsAppMs, type CanalEnvio, type LineaEnvioWhatsApp } from "../../domain/envios-ritmo";
import { getAppPool, withTx } from "../db";
import { clientesPorDefecto, leerConfigEnvios, remitenteEfectivo, type Clientes } from "../envios-config";
import { mensajeCredencial } from "../envios";
import { seleccionarParaCredencial } from "../credenciales";
import { medidasCredencial } from "../credencial-config";
import { credencialesIndividuales } from "../pdf/credencial";
import type { ResultadoProveedor } from "./http";

// Cola de envío real (09 §3.7). Procesa como mucho UN mensaje por canal y vuelta; la pausa al azar entre mensajes se guarda
// en la base (`<canal>_proximo_en`), así sobrevive a reinicios. Las fichas de prueba nunca salen por aquí.
export type ResultadoCanal = { accion: "enviado" | "fallo" | "omitido" | "pausado" | "candado"; motivo?: string };
type ResultadosCola = Record<CanalEnvio, ResultadoCanal> & { whatsapp2?: ResultadoCanal };
export type OpcionesCola = { ahora?: Date; azar?: () => number; clientes?: Clientes; canales?: CanalEnvio[] };

export const CLAVE_CANDADO_COLA = 4343;
export const MENSAJE_INTERRUMPIDO = "Interrumpido: no se sabe si salió. Reintente si no le llegó.";

// Nunca se reenvía a ciegas: una fila que quedó «en cola» ya intentada (intentos = 1) al arrancar pasa a fallo.
export async function recuperarInterrumpidas(): Promise<number> {
  return withTx(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [CLAVE_CANDADO_COLA]);
    const r = await client.query(
      `UPDATE envios_credencial
          SET estado = CASE WHEN brevo_estado IS NULL THEN 'fallo' ELSE 'enviada_al_servicio' END,
              error = CASE WHEN brevo_estado IS NULL THEN $1 END,
              enviado_en = coalesce(enviado_en, brevo_evento_en)
        WHERE estado = 'en_cola' AND intentos = 1 AND NOT simulado`, [MENSAJE_INTERRUMPIDO],
    );
    return r.rowCount ?? 0;
  });
}

export async function procesarCola(opciones: OpcionesCola = {}): Promise<ResultadosCola> {
  const reloj = () => opciones.ahora ?? new Date();
  const azar = opciones.azar ?? Math.random;
  const canales = opciones.canales ?? (["whatsapp", "correo"] as CanalEnvio[]);
  const resultado: ResultadosCola = { whatsapp: { accion: "omitido", motivo: "no tocaba" }, correo: { accion: "omitido", motivo: "no tocaba" } };
  const pool = await getAppPool();
  const client = await pool.connect();
  try {
    // Un solo proceso a la vez: candado de sesión (se libera solo si la conexión se corta).
    const tengo = (await client.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [CLAVE_CANDADO_COLA])).rows[0].ok;
    if (!tengo) {
      for (const c of canales) resultado[c] = { accion: "candado", motivo: "otro proceso está enviando" };
      return resultado;
    }
    try {
      const clientes = opciones.clientes ?? clientesPorDefecto();
      for (const canal of canales) {
        resultado[canal] = await procesarCanal(client, canal, reloj, azar, clientes, 1);
        if (canal === "whatsapp" && clientes.whatsapp2) {
          resultado.whatsapp2 = await procesarCanal(client, canal, reloj, azar, clientes, 2);
        }
      }
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [CLAVE_CANDADO_COLA]);
    }
  } finally {
    client.release();
  }
  return resultado;
}

const COL = {
  whatsapp2: { real: "whatsapp_real_2", proximo: "whatsapp_proximo_en_2", pausa: "whatsapp_pausa_motivo_2" },
  whatsapp: { real: "whatsapp_real", proximo: "whatsapp_proximo_en", pausa: "whatsapp_pausa_motivo" },
  correo: { real: "correo_real", proximo: "correo_proximo_en", pausa: "correo_pausa_motivo" },
} as const;

async function pausar(client: PoolClient, clave: keyof typeof COL, motivo: string): Promise<ResultadoCanal> {
  await client.query(`UPDATE configuracion SET ${COL[clave].pausa} = $1 WHERE id = 1`, [motivo]);
  return { accion: "pausado", motivo };
}

async function procesarCanal(client: PoolClient, canal: CanalEnvio, reloj: () => Date, azar: () => number, clientes: Clientes, linea: LineaEnvioWhatsApp): Promise<ResultadoCanal> {
  const clave = canal === "whatsapp" && linea === 2 ? "whatsapp2" : canal;
  const col = COL[clave];
  const whatsapp = linea === 2 ? clientes.whatsapp2! : clientes.whatsapp;
  const cfg = (await client.query<{ real: boolean; proximo: Date | null; pausa: string | null }>(`SELECT ${col.real} AS real, ${col.proximo} AS proximo, ${col.pausa} AS pausa FROM configuracion WHERE id = 1`)).rows[0];
  if (!cfg.real) return { accion: "omitido", motivo: "interruptor apagado" };
  if (cfg.pausa) return { accion: "pausado", motivo: cfg.pausa };
  const ahora = reloj();
  if (canal === "whatsapp" && cfg.proximo && ahora < cfg.proximo) return { accion: "omitido", motivo: "esperando la pausa entre envíos" };

  const hay = (await client.query(
    `SELECT 1 FROM envios_credencial e JOIN mjrv m ON m.id = e.mjrv_id WHERE e.canal = $1 AND e.estado = 'en_cola' AND NOT e.simulado AND e.intentos = 0 AND NOT m.es_prueba AND e.linea_whatsapp = $2 LIMIT 1`, [canal, linea])).rowCount;
  if (!hay) return { accion: "omitido", motivo: "cola vacía" };
  if ((canal === "whatsapp" ? whatsapp : clientes.correo).simulado) return pausar(client, clave, canal === "whatsapp" ? "Falta la configuración de Evolution API." : "Falta la clave de Brevo.");

  if (canal === "whatsapp") {
    try {
      if ((await whatsapp.resumen()).estado !== "open") return pausar(client, clave, "La línea de WhatsApp no está vinculada.");
    } catch {
      await client.query(`UPDATE configuracion SET ${col.proximo} = $1 WHERE id = 1`, [new Date(ahora.getTime() + 30_000)]);
      return { accion: "omitido", motivo: "Evolution API no responde" };
    }
  }
  const configEnvios = await leerConfigEnvios();
  const remitente = remitenteEfectivo(configEnvios);
  if (canal === "correo" && (!remitente.direccion || !remitente.nombre)) return pausar(client, clave, "Falta el remitente del correo.");

  // Reclamo atómico: una sola fila, marcada como intentada antes de enviar.
  const fila = (await client.query<{ id: number; mjrv_id: number; destino: string }>(
    `UPDATE envios_credencial SET intentos = 1 WHERE id = (
       SELECT e.id FROM envios_credencial e JOIN mjrv m ON m.id = e.mjrv_id
        WHERE e.canal = $1 AND e.estado = 'en_cola' AND NOT e.simulado AND e.intentos = 0 AND NOT m.es_prueba AND e.linea_whatsapp = $2
        ORDER BY e.id FOR UPDATE OF e SKIP LOCKED LIMIT 1)
     RETURNING id, mjrv_id, destino`, [canal, linea])).rows[0];
  if (!fila) return { accion: "omitido", motivo: "cola vacía" };

  let r: ResultadoProveedor;
  try {
    const sel = await seleccionarParaCredencial({ alcance: "ids", ids: [fila.mjrv_id] });
    if (sel.datos.length === 0) r = { ok: false, permanente: true, error: "La ficha ya no tiene una credencial disponible." };
    else {
      const d = sel.datos[0];
      const m = await mensajeCredencial(d, canal, sel.personas[0]);
      // El interruptor autoriza credenciales definitivas para fichas reales incluso durante el ensayo operativo.
      const pdfBase64 = Buffer.from(await credencialesIndividuales([{ ...d, prueba: false }], await medidasCredencial())).toString("base64");
      const actual = (await client.query<{ destino: string | null }>(
        "SELECT CASE WHEN $2 = 'whatsapp' THEN telefono_e164 ELSE correo END AS destino FROM mjrv WHERE id = $1 AND activo AND NOT es_prueba",
        [fila.mjrv_id, canal])).rows[0];
      if (actual?.destino !== fila.destino) {
        r = { ok: false, permanente: true, error: "El contacto o la ficha cambió después de ponerla en cola. Revise la ficha y vuelva a encolarla." };
      } else if (canal === "whatsapp") {
        r = await whatsapp.enviarDocumento({ numero: fila.destino, texto: m.texto, nombreArchivo: m.nombreArchivo, pdfBase64 });
      } else {
        r = await clientes.correo.enviar({ envioId: fila.id, para: fila.destino, asunto: m.asunto, texto: m.texto, html: m.html, remitente, responderA: configEnvios.correoReplyTo ?? undefined, adjunto: { nombre: m.nombreArchivo, base64: pdfBase64 } });
      }
    }
  } catch (e) {
    r = { ok: false, permanente: false, incierto: true, error: `Error al enviar: ${(e as Error).message}`.slice(0, 200) };
  }

  // «enviado_en» es el momento del intento (también en los fallos): sirve para contar los fallos seguidos.
  if (r.ok) {
    await client.query("UPDATE envios_credencial SET estado = 'enviada_al_servicio', id_externo = $2, enviado_en = $3 WHERE id = $1", [fila.id, r.idExterno, ahora]);
  } else {
    const confirmado = await client.query<{ estado: string }>("UPDATE envios_credencial SET estado = CASE WHEN brevo_estado IS NULL THEN 'fallo' ELSE 'enviada_al_servicio' END, error = CASE WHEN brevo_estado IS NULL THEN $2 END, enviado_en = $3 WHERE id = $1 RETURNING estado", [fila.id, r.error.slice(0, 300), ahora]);
    if (confirmado.rows[0]?.estado === "enviada_al_servicio") return { accion: "enviado" };
  }
  if (canal === "whatsapp") {
    await client.query(`UPDATE configuracion SET ${col.proximo} = $1 WHERE id = 1`, [new Date(reloj().getTime() + pausaWhatsAppMs(azar))]);
  }

  if (!r.ok) {
    // Pausa tras N fallos seguidos desde la última reanudación.
    const ultimos = (await client.query<{ estado: string }>(
      `SELECT CASE WHEN brevo_estado IS NOT NULL THEN 'enviada_al_servicio' ELSE estado END AS estado
         FROM envios_credencial
        WHERE canal = $1 AND linea_whatsapp = $3 AND NOT simulado AND estado IN ('enviada_al_servicio','fallo')
          AND enviado_en > coalesce((SELECT max(creado_en) FROM auditoria WHERE accion = 'envios_reanudados' AND datos->>'canal' = $1 AND coalesce(datos->>'linea', '1') = $3::smallint::text), '-infinity')
        ORDER BY enviado_en DESC, id DESC LIMIT $2`, [canal, FALLOS_PARA_PAUSAR, linea])).rows;
    if (ultimos.length === FALLOS_PARA_PAUSAR && ultimos.every((u) => u.estado === "fallo")) await pausar(client, clave, `${FALLOS_PARA_PAUSAR} fallos seguidos. Revise la conexión y reanude.`);
    return { accion: "fallo", motivo: r.error };
  }
  return { accion: "enviado" };
}
