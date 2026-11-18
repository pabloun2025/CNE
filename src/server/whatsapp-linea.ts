import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { query, withTx } from "./db";
import { clienteEvolution, ErrorEvolution, INSTANCIA_CNE, type ClienteEvolution } from "./envios/evolution";

// Línea de WhatsApp de CNE: una sola instancia fija (`cne-madrid`) de la Evolution API compartida. Solo la superadmin.
export type EstadoLinea = "sin_crear" | "esperando_qr" | "vinculada" | "desconectada";
export type LineaWhatsApp = { estado: EstadoLinea; numero: string | null; qr: string | null; simulada: boolean; instancia: string; error?: string };

function exigirSuperadmin(sesion: Sesion): void {
  if (sesion.tipo !== "superadmin") throw new Error("Solo la superadministración puede hacer esto.");
}

const mensaje = (e: unknown) => (e instanceof ErrorEvolution ? e.message : "No se pudo consultar la línea de WhatsApp.");

// Estado actual. Con `conQr` y la línea sin vincular, pide un código nuevo (los códigos de WhatsApp caducan en segundos).
export async function estadoLinea(sesion: Sesion, opciones: { conQr?: boolean; cliente?: ClienteEvolution } = {}): Promise<LineaWhatsApp> {
  exigirSuperadmin(sesion);
  const cliente = opciones.cliente ?? clienteEvolution();
  const base = { instancia: INSTANCIA_CNE, simulada: cliente.simulado, qr: null as string | null };
  try {
    const r = await cliente.resumen();
    if (!r.existe) return { ...base, estado: "sin_crear", numero: null };
    if (r.estado === "open") {
      await query("UPDATE configuracion SET whatsapp_numero = $1 WHERE id = 1 AND whatsapp_numero IS DISTINCT FROM $1", [r.numero]);
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
export async function crearLinea(sesion: Sesion, cliente: ClienteEvolution = clienteEvolution()): Promise<LineaWhatsApp> {
  exigirSuperadmin(sesion);
  let creada = false;
  try {
    const antes = await cliente.resumen();
    if (!antes.existe) { await cliente.crearInstancia(); creada = true; }
  } catch (e) {
    return { estado: "desconectada", numero: null, qr: null, simulada: cliente.simulado, instancia: INSTANCIA_CNE, error: mensaje(e) };
  }
  await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: creada ? "linea_whatsapp_creada" : "linea_whatsapp_vinculacion", entidad: "configuracion", entidadId: 1, datos: { instancia: INSTANCIA_CNE, simulada: cliente.simulado } });
  return estadoLinea(sesion, { conQr: true, cliente });
}

// Desvincular cierra la sesión de WhatsApp y apaga el envío real por WhatsApp (sin línea no puede salir nada).
export async function desvincularLinea(sesion: Sesion, cliente: ClienteEvolution = clienteEvolution()): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  exigirSuperadmin(sesion);
  try {
    await cliente.cerrarSesion();
  } catch (e) {
    return { ok: false, mensaje: mensaje(e) };
  }
  await withTx(async (client) => {
    await client.query("UPDATE configuracion SET whatsapp_real = false, whatsapp_numero = NULL, actualizado_en = now(), actualizado_por = $1 WHERE id = 1", [sesion.usuarioId]);
    await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "linea_whatsapp_desvinculada", entidad: "configuracion", entidadId: 1, datos: { instancia: INSTANCIA_CNE } }, client);
  });
  return { ok: true };
}
