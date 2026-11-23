import type { Sesion } from "./auth";
import type { LineaEnvioWhatsApp } from "../domain/envios-ritmo";
import { registrarAuditoria } from "./auditoria";
import { query, withTx } from "./db";
import { clienteEvolution, ErrorEvolution, instanciaWhatsApp, type ClienteEvolution } from "./envios/evolution";

export type EstadoLinea = "sin_crear" | "esperando_qr" | "vinculada" | "desconectada";
export type LineaWhatsApp = { estado: EstadoLinea; numero: string | null; qr: string | null; simulada: boolean; instancia: string; error?: string };

export function leerLineaWhatsApp(valor: unknown): LineaEnvioWhatsApp | null {
  if (valor == null || valor === 1 || valor === "1") return 1;
  if (valor === 2 || valor === "2") return 2;
  return null;
}

function exigirSuperadmin(sesion: Sesion) {
  if (sesion.tipo !== "superadmin") throw new Error("Solo Superadministración puede gestionar la línea.");
}

const mensaje = (e: unknown) => (e instanceof ErrorEvolution ? e.message : "No se pudo consultar la línea de WhatsApp.");

// Estado actual. Con `conQr` y la línea sin vincular, pide un código nuevo (los códigos de WhatsApp caducan en segundos).
export async function estadoLinea(sesion: Sesion, opciones: { conQr?: boolean; cliente?: ClienteEvolution; linea?: LineaEnvioWhatsApp } = {}): Promise<LineaWhatsApp> {
  exigirSuperadmin(sesion);
  const linea = opciones.linea ?? 1;
  const cliente = opciones.cliente ?? clienteEvolution({ linea });
  const base = { instancia: instanciaWhatsApp(linea), simulada: cliente.simulado, qr: null as string | null };
  const columna = linea === 2 ? "whatsapp_numero_2" : "whatsapp_numero";
  try {
    const r = await cliente.resumen();
    if (!r.existe) return { ...base, estado: "sin_crear", numero: null };
    if (r.estado === "open") {
      if (r.numero) await query(`UPDATE configuracion SET ${columna} = $1 WHERE id = 1 AND ${columna} IS DISTINCT FROM $1`, [r.numero]);
      return { ...base, estado: "vinculada", numero: r.numero };
    }
    if (opciones.conQr) {
      const c = await cliente.conectar();
      if (c.estado === "open") return { ...base, estado: "vinculada", numero: r.numero };
      return { ...base, estado: "esperando_qr", numero: null, qr: c.qr };
    }
    return { ...base, estado: r.estado === "connecting" ? "esperando_qr" : "desconectada", numero: null };
  } catch (e) {
    return { ...base, estado: "desconectada", numero: null, error: mensaje(e) };
  }
}

// «Crear y vincular»: crea la instancia solo si no existe (crear dos veces no duplica) y devuelve el código QR.
export async function crearLinea(sesion: Sesion, cliente?: ClienteEvolution, linea: LineaEnvioWhatsApp = 1): Promise<LineaWhatsApp> {
  exigirSuperadmin(sesion);
  const instancia = instanciaWhatsApp(linea);
  cliente ??= clienteEvolution({ linea });
  let creada = false;
  try {
    const antes = await cliente.resumen();
    if (!antes.existe) { await cliente.crearInstancia(); creada = true; }
  } catch (e) {
    return { estado: "desconectada", numero: null, qr: null, simulada: cliente.simulado, instancia, error: mensaje(e) };
  }
  await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: creada ? "linea_whatsapp_creada" : "linea_whatsapp_vinculacion", entidad: "configuracion", entidadId: 1, datos: { instancia, linea, simulada: cliente.simulado } });
  return estadoLinea(sesion, { conQr: true, cliente, linea });
}

// Desvincular cierra la sesión de WhatsApp y apaga el envío real por WhatsApp (sin línea no puede salir nada).
export async function desvincularLinea(sesion: Sesion, cliente?: ClienteEvolution, linea: LineaEnvioWhatsApp = 1): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  exigirSuperadmin(sesion);
  const instancia = instanciaWhatsApp(linea);
  cliente ??= clienteEvolution({ linea });
  const sufijo = linea === 2 ? "_2" : "";
  try {
    await cliente.cerrarSesion();
  } catch (e) {
    return { ok: false, mensaje: mensaje(e) };
  }
  await withTx(async (client) => {
    await client.query(`UPDATE configuracion SET whatsapp_real${sufijo} = false, whatsapp_numero${sufijo} = NULL, actualizado_en = now(), actualizado_por = $1 WHERE id = 1`, [sesion.usuarioId]);
    await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "linea_whatsapp_desvinculada", entidad: "configuracion", entidadId: 1, datos: { instancia, linea } }, client);
  });
  return { ok: true };
}
