import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { query } from "./db";
import { credencialesIndividuales } from "./pdf/credencial";
import { seleccionarParaCredencial } from "./credenciales";
import { canalEnReal } from "./envios-config";
import { elegirProveedor, type Canal, type ProveedorEnvio } from "./envios/proveedor";
import type { DatosCredencial } from "./pdf/credencial";

export type EstadoEnvio = "en_cola" | "enviada_al_servicio" | "fallo" | "entregada";
export const ETIQUETA_ESTADO: Record<EstadoEnvio, string> = { en_cola: "En cola", enviada_al_servicio: "Enviada al servicio", fallo: "Falló el envío", entregada: "Entrega confirmada" };
export type ResultadoEnvio = { ok: true; simulado: boolean; enCola?: boolean } | { ok: false; mensaje: string };

// Texto y nombre de archivo del mensaje; lo comparten el envío inmediato (simulado) y la cola real.
export function mensajeCredencial(d: DatosCredencial): { asunto: string; texto: string; nombreArchivo: string } {
  return {
    asunto: "Su credencial de miembro de Junta Receptora del Voto",
    texto: `Buen día, ${d.nombres}. Adjuntamos su credencial de miembro de Junta Receptora del Voto (${d.rotulo}). Preséntela con su cédula.`,
    nombreArchivo: `credencial-${d.rotulo}.pdf`,
  };
}

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const etiquetaCanal: Record<Canal, string> = { whatsapp: "WhatsApp", correo: "correo" };

// Envía la credencial de una persona. Registra siempre el intento. No repite si ya hay un envío vivo; un fallo se puede reintentar.
export async function enviarCredencial(sesion: Sesion, mjrvId: number, canal: Canal, proveedor?: ProveedorEnvio): Promise<ResultadoEnvio> {
  if (sesion.tipo !== "madrid_admin") throw new Error("Solo la administración Madrid envía credenciales.");
  const f = (await query<{ id: number; correo: string | null; telefono_e164: string | null; es_prueba: boolean }>("SELECT id, correo, telefono_e164, es_prueba FROM mjrv WHERE id = $1 AND activo", [mjrvId]))[0];
  if (!f) return { ok: false, mensaje: "La ficha no existe o está de baja." };
  const destino = canal === "whatsapp" ? f.telefono_e164 : f.correo;
  if (!destino || (canal === "correo" && !CORREO.test(destino))) return { ok: false, mensaje: `La ficha no tiene ${canal === "whatsapp" ? "teléfono" : "correo"} válido.` };

  const sel = await seleccionarParaCredencial({ alcance: "ids", ids: [mjrvId] });
  if (sel.datos.length === 0) return { ok: false, mensaje: "Falta el rótulo de la credencial de esta persona (pendiente)." };
  const d = sel.datos[0];

  // Envío real (interruptor encendido) solo para fichas reales: se encola y lo envía la cola con pausas. Las de demostración nunca.
  const real = !proveedor && !f.es_prueba && (await canalEnReal(canal));
  const prov = proveedor ?? elegirProveedor(canal);

  // El índice único parcial hace atómico el «no repetir»: dos clics a la vez crean una sola fila.
  const nueva = await query<{ id: number }>(
    "INSERT INTO envios_credencial (mjrv_id, canal, destino, estado, simulado, creado_por) VALUES ($1,$2,$3,'en_cola',$5,$4) ON CONFLICT DO NOTHING RETURNING id",
    [mjrvId, canal, destino, sesion.usuarioId, !real],
  );
  if (!nueva[0]) return { ok: false, mensaje: `Ya hay un envío por ${etiquetaCanal[canal]} para esta persona.` };

  if (real) {
    await registrarAuditoria({ portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "credencial_encolada", entidad: "mjrv", entidadId: mjrvId, datos: { canal } });
    return { ok: true, simulado: false, enCola: true };
  }

  try {
    const pdf = await credencialesIndividuales(sel.datos);
    const m = mensajeCredencial(d);
    const r = await prov.enviar({ destino, nombre: `${d.nombres} ${d.apellidos}`, rotulo: d.rotulo, nombreArchivo: m.nombreArchivo, pdf, asunto: m.asunto, texto: m.texto });
    // El estado es «enviada al servicio»: no se afirma que llegó (solo el proveedor real podría confirmarlo).
    await query("UPDATE envios_credencial SET estado = 'enviada_al_servicio', simulado = $2, id_externo = $3, enviado_en = now() WHERE id = $1", [nueva[0].id, r.simulado, r.idExterno]);
    await registrarAuditoria({ portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: r.simulado ? "credencial_envio_simulado" : "credencial_envio", entidad: "mjrv", entidadId: mjrvId, datos: { canal } });
    return { ok: true, simulado: r.simulado };
  } catch (e) {
    await query("UPDATE envios_credencial SET estado = 'fallo', error = $2 WHERE id = $1", [nueva[0].id, (e as Error).message.slice(0, 300)]);
    return { ok: false, mensaje: "Falló el envío. Puede reintentarlo." };
  }
}

export type ResumenLote = { intentadas: number; enviadas: number; omitidas: number; fallidas: number; enCola: number };

// Envío a todas las personas con dato de contacto que aún no tienen envío vivo por ese canal.
export async function enviarLote(sesion: Sesion, canal: Canal, proveedor?: ProveedorEnvio): Promise<ResumenLote | { error: string }> {
  if (sesion.tipo !== "madrid_admin") throw new Error("Solo la administración Madrid envía credenciales.");
  const col = canal === "whatsapp" ? "telefono_e164" : "correo";
  const pendientes = await query<{ id: number }>(
    `SELECT m.id FROM mjrv m WHERE m.activo AND m.${col} IS NOT NULL AND btrim(m.${col}) <> ''
        AND NOT EXISTS (SELECT 1 FROM envios_credencial e WHERE e.mjrv_id = m.id AND e.canal = $1 AND e.estado IN ('en_cola','enviada_al_servicio','entregada'))
      ORDER BY m.id LIMIT 700`, [canal]);
  const r: ResumenLote = { intentadas: pendientes.length, enviadas: 0, omitidas: 0, fallidas: 0, enCola: 0 };
  for (const p of pendientes) {
    const x = await enviarCredencial(sesion, p.id, canal, proveedor);
    if (x.ok && x.enCola) r.enCola++;
    else if (x.ok) r.enviadas++;
    else if (/rótulo|correo válido|teléfono válido|Ya hay/.test(x.mensaje)) r.omitidas++;
    else r.fallidas++;
  }
  return r;
}

export type EnvioFila = { id: number; canal: Canal; destino: string; estado: EstadoEnvio; simulado: boolean; error: string | null; creado_en: string; enviado_en: string | null };
export const enviosDe = (mjrvId: number) =>
  query<EnvioFila>("SELECT id, canal, destino, estado, simulado, error, creado_en::text, enviado_en::text FROM envios_credencial WHERE mjrv_id = $1 ORDER BY id DESC", [mjrvId]);

export async function resumenEnvios(): Promise<{ conTelefono: number; conCorreo: number; whatsapp: number; correo: number }> {
  const f = await query<{ tel: number; cor: number; w: number; c: number }>(
    `SELECT count(*) FILTER (WHERE telefono_e164 IS NOT NULL)::int AS tel, count(*) FILTER (WHERE correo IS NOT NULL)::int AS cor,
            (SELECT count(DISTINCT mjrv_id)::int FROM envios_credencial WHERE canal = 'whatsapp' AND estado <> 'fallo') AS w,
            (SELECT count(DISTINCT mjrv_id)::int FROM envios_credencial WHERE canal = 'correo' AND estado <> 'fallo') AS c
       FROM mjrv WHERE activo`);
  return { conTelefono: f[0].tel, conCorreo: f[0].cor, whatsapp: f[0].w, correo: f[0].c };
}
