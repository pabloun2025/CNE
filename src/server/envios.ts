import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { query, withTx } from "./db";
import { credencialesIndividuales } from "./pdf/credencial";
import { nombrePdfCredencial, seleccionarParaCredencial, type PersonaCredencial, type Seleccion } from "./credenciales";
import { medidasCredencial } from "./credencial-config";
import { correoCredencial, textoCredencial } from "../domain/mensaje-credencial";
import { leerJunta, zonaDe } from "../domain/juntas";
import { formularioAbierto } from "./documentos";
import { enlaceWallet } from "./wallet/google";
import { canalEnReal } from "./envios-config";
import { elegirProveedor, type Canal, type ProveedorEnvio } from "./envios/proveedor";
import type { DatosCredencial } from "./pdf/credencial";
import type { EstadoBrevo } from "./envios/brevo-webhook";

export type EstadoEnvio = "en_cola" | "enviada_al_servicio" | "fallo" | "entregada";
export type ResultadoEnvio = { ok: true; simulado: boolean; enCola?: boolean } | { ok: false; mensaje: string };

// Texto y nombre de archivo del mensaje; lo comparten el envío inmediato (simulado) y la cola real.
export async function mensajeCredencial(d: DatosCredencial, canal: Canal, { id, junta, zona }: Pick<PersonaCredencial, "id" | "junta" | "zona">): Promise<{ asunto: string; texto: string; html?: string; nombreArchivo: string }> {
  // Fichas de prueba o modo prueba: nunca hay enlace de Google Wallet.
  const wallet = d.prueba ? null : enlaceWallet(id, process.env.HOST_MADRID);
  const datos = { nombres: d.nombres, rotulo: d.rotulo, host: process.env.HOST_MADRID, wallet };
  const nombreArchivo = nombrePdfCredencial(junta, d.cedula);
  if (canal === "whatsapp") {
    return { asunto: "Su credencial de miembro de Junta Receptora del Voto", texto: textoCredencial(datos), nombreArchivo };
  }
  const asignada = leerJunta(junta);
  if (!asignada || zonaDe(asignada.serie, asignada.numero) !== zona) {
    throw new Error("La junta o su zona de color es incoherente. Revise la asignación de la ficha.");
  }
  const documentosAbierto = datos.host?.trim() ? await formularioAbierto() : false;
  return { ...correoCredencial({ nombres: d.nombres, host: datos.host, wallet, junta, zona, documentosAbierto }), nombreArchivo };
}

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const etiquetaCanal: Record<Canal, string> = { whatsapp: "WhatsApp", correo: "correo" };

export async function enviarCredencial(sesion: Sesion, mjrvId: number, canal: Canal, proveedor?: ProveedorEnvio, reenviar = false): Promise<ResultadoEnvio> {
  if (sesion.tipo !== "madrid_admin") throw new Error("Solo la administración Madrid envía credenciales.");
  const canalReal = !proveedor && await canalEnReal(canal);
  const sel = await seleccionarParaCredencial({ alcance: "ids", ids: [mjrvId] });
  const reserva = await withTx(async (client) => {
    // Serializa el alta de intentos de una ficha. El índice protege la cola y permite conservar los enviados.
    const f = (await client.query<{ correo: string | null; telefono_e164: string | null; es_prueba: boolean }>(
      "SELECT correo, telefono_e164, es_prueba FROM mjrv WHERE id = $1 AND activo AND incorporado_en IS NULL FOR UPDATE", [mjrvId])).rows[0];
    if (!f) return { ok: false as const, mensaje: "La ficha no existe o está de baja." };
    const destino = canal === "whatsapp" ? f.telefono_e164 : f.correo;
    if (!destino || (canal === "correo" && !CORREO.test(destino))) return { ok: false as const, mensaje: `La ficha no tiene ${canal === "whatsapp" ? "teléfono" : "correo"} válido.` };
    if (!sel.datos.length) return { ok: false as const, mensaje: "La ficha cambió. Actualice la lista y vuelva a intentarlo." };

    const real = canalReal && !f.es_prueba;
    const nueva = (await client.query<{ id: number }>(
      `WITH anterior AS (
         SELECT 1 FROM envios_credencial WHERE mjrv_id = $1 AND canal = $2 AND simulado = $5
           AND (estado IN ('enviada_al_servicio','entregada') OR brevo_estado IS NOT NULL)
       )
       INSERT INTO envios_credencial (mjrv_id, canal, destino, estado, simulado, creado_por, reenvio)
       SELECT $1,$2,$3,'en_cola',$5,$4, EXISTS (SELECT 1 FROM anterior)
       WHERE ($6::boolean OR NOT EXISTS (SELECT 1 FROM anterior))
       ON CONFLICT DO NOTHING RETURNING id`,
      [mjrvId, canal, destino, sesion.usuarioId, !real, reenviar],
    )).rows[0];
    if (!nueva) return { ok: false as const, mensaje: `Ya hay un envío por ${etiquetaCanal[canal]} para esta persona.` };
    if (real) {
      await registrarAuditoria({ portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "credencial_encolada", entidad: "mjrv", entidadId: mjrvId, datos: { canal, reenviar } }, client);
    }
    return { ok: true as const, id: nueva.id, real, destino };
  });
  if (!reserva.ok) return reserva;
  const { id, real, destino } = reserva;
  const d = sel.datos[0];

  if (real) {
    return { ok: true, simulado: false, enCola: true };
  }

  try {
    const m = await mensajeCredencial(d, canal, sel.personas[0]);
    const pdf = await credencialesIndividuales(sel.datos, await medidasCredencial());
    const prov = proveedor ?? elegirProveedor(canal);
    const r = await prov.enviar({ ...m, destino, nombre: `${d.nombres} ${d.apellidos}`, rotulo: d.rotulo, pdf });
    // El estado es «enviada al servicio»: no se afirma que llegó (solo el proveedor real podría confirmarlo).
    await query("UPDATE envios_credencial SET estado = 'enviada_al_servicio', simulado = $2, id_externo = $3, enviado_en = now() WHERE id = $1", [id, r.simulado, r.idExterno]);
    await registrarAuditoria({ portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: r.simulado ? "credencial_envio_simulado" : "credencial_envio", entidad: "mjrv", entidadId: mjrvId, datos: { canal, reenviar } });
    return { ok: true, simulado: r.simulado };
  } catch (e) {
    await query("UPDATE envios_credencial SET estado = 'fallo', error = $2 WHERE id = $1", [id, (e as Error).message.slice(0, 300)]);
    return { ok: false, mensaje: "Falló el envío. Puede reintentarlo." };
  }
}

export type ResumenLote = { intentadas: number; enviadas: number; omitidas: number; fallidas: number; enCola: number };

export async function enviarLote(sesion: Sesion, canal: Canal, proveedor?: ProveedorEnvio, seleccion: Seleccion = { alcance: "todas" }, reenviar = false): Promise<ResumenLote> {
  if (sesion.tipo !== "madrid_admin") throw new Error("Solo la administración Madrid envía credenciales.");
  const col = canal === "whatsapp" ? "telefono_e164" : "correo";
  const ids = seleccion.alcance === "todas" ? null : (await seleccionarParaCredencial(seleccion)).ids;
  const real = !proveedor && await canalEnReal(canal);
  const pendientes = await query<{ id: number }>(
    `SELECT m.id FROM mjrv m WHERE m.activo AND m.incorporado_en IS NULL AND m.${col} IS NOT NULL AND btrim(m.${col}) <> ''
        AND ($2::bigint[] IS NULL OR m.id = ANY($2::bigint[]))
        AND NOT EXISTS (SELECT 1 FROM envios_credencial e WHERE e.mjrv_id = m.id AND e.canal = $1
          AND e.simulado = (NOT $3::boolean OR m.es_prueba)
          AND (e.estado = 'en_cola' OR (NOT $4::boolean AND (e.estado IN ('enviada_al_servicio','entregada') OR e.brevo_estado IS NOT NULL))))
      ORDER BY m.id`, [canal, ids, real, reenviar]);
  const omitidas = seleccion.alcance === "ids" ? new Set(seleccion.ids).size - pendientes.length : 0;
  const r: ResumenLote = { intentadas: pendientes.length, enviadas: 0, omitidas, fallidas: 0, enCola: 0 };
  for (const p of pendientes) {
    const x = await enviarCredencial(sesion, p.id, canal, proveedor, reenviar);
    if (x.ok && x.enCola) r.enCola++;
    else if (x.ok) r.enviadas++;
    else if (/correo válido|teléfono válido|Ya hay|no existe/.test(x.mensaje)) r.omitidas++;
    else r.fallidas++;
  }
  return r;
}

export type EnvioFila = { id: number; canal: Canal; destino: string; estado: EstadoEnvio; simulado: boolean; error: string | null; creado_en: string; enviado_en: string | null; brevo_estado: EstadoBrevo | null; brevo_evento_en: string | null };
export const enviosDe = (mjrvId: number) =>
  query<EnvioFila>("SELECT id, canal, destino, estado, simulado, error, creado_en::text, enviado_en::text, brevo_estado, brevo_evento_en::text FROM envios_credencial WHERE mjrv_id = $1 ORDER BY id DESC", [mjrvId]);
