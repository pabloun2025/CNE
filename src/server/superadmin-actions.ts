"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "./guard";
import { activarAdmin, cambiarModo, crearAdmin, restablecerAdmin } from "./superadmin";
import type { Modo } from "./config";
import { cargarDemo, quitarDemo } from "./demo";
import { prepararEleccion } from "./preparar-eleccion";
import { borrarTodasLasFotos } from "./documentos";
import { crearRespaldo } from "./respaldo";
import { crearLinea, desvincularLinea } from "./whatsapp-linea";
import { cambiarInterruptor, guardarRemitente, reanudarEnvios } from "./envios-config";

export type EstadoSuper = { error?: string; aviso?: string; password?: string; enlace?: string; detalle?: string[]; qr?: string } | null;

export async function crearAdminAccion(_: EstadoSuper, f: FormData): Promise<EstadoSuper> {
  const sesion = await requireSuperadmin();
  const r = await crearAdmin(sesion, String(f.get("correo") ?? ""), String(f.get("nombre") ?? ""), String(f.get("rol") ?? ""));
  revalidatePath("/superadmin");
  return r.ok ? { aviso: "Cuenta creada. Entregue esta contraseña temporal; no se vuelve a mostrar.", password: r.password } : { error: r.mensaje };
}

export async function restablecerAdminAccion(_: EstadoSuper, f: FormData): Promise<EstadoSuper> {
  const sesion = await requireSuperadmin();
  const r = await restablecerAdmin(sesion, Number(f.get("id")));
  return r.ok ? { aviso: "Contraseña temporal nueva. No se vuelve a mostrar.", password: r.password } : { error: r.mensaje };
}

export async function activarAdminAccion(f: FormData): Promise<void> {
  const sesion = await requireSuperadmin();
  await activarAdmin(sesion, Number(f.get("id")), f.get("activo") === "1");
  revalidatePath("/superadmin");
}

export async function cambiarModoAccion(_: EstadoSuper, f: FormData): Promise<EstadoSuper> {
  const sesion = await requireSuperadmin();
  const destino = f.get("destino") === "eleccion" ? "eleccion" : "prueba";
  const r = await cambiarModo(sesion, destino as Modo, String(f.get("confirmacion") ?? ""));
  revalidatePath("/superadmin", "layout");
  return r.ok ? { aviso: `Modo cambiado a ${destino === "prueba" ? "prueba" : "elección"}.` } : { error: r.mensaje };
}

export async function cargarDemoAccion(): Promise<EstadoSuper> {
  const sesion = await requireSuperadmin();
  try {
    const r = await cargarDemo(sesion);
    revalidatePath("/superadmin");
    return { aviso: r.insertadas ? `Se cargaron ${r.insertadas} fichas de demostración.` : "Los datos de demostración ya estaban cargados." };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function quitarDemoAccion(): Promise<EstadoSuper> {
  const sesion = await requireSuperadmin();
  try {
    const r = await quitarDemo(sesion);
    revalidatePath("/superadmin");
    return { aviso: `Se quitaron ${r.borradas} fichas de demostración.` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

const rutaDescarga = (archivo: string) => `/superadmin/respaldo/${archivo}`;

// Respaldo suelto para descargar (sin limpiar nada).
export async function respaldarAccion(): Promise<EstadoSuper> {
  await requireSuperadmin();
  try {
    const r = await crearRespaldo();
    return { aviso: `Respaldo listo (${(r.bytes / 1048576).toFixed(1)} MB). Descárguelo y guárdelo fuera del servidor.`, enlace: rutaDescarga(r.archivo) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function prepararEleccionAccion(_: EstadoSuper, f: FormData): Promise<EstadoSuper> {
  const sesion = await requireSuperadmin();
  const r = await prepararEleccion(sesion, String(f.get("confirmacion") ?? ""));
  revalidatePath("/superadmin", "layout");
  if (!r.ok) return { error: r.mensaje };
  return {
    aviso: "Listo: el sistema quedó en modo elección. Descargue el respaldo antes de salir.",
    enlace: rutaDescarga(r.respaldo.archivo),
    detalle: [...r.antes.map((a) => `${a.etiqueta}: ${a.n} borradas`), `Lote de copia interna: ${r.lote}`],
  };
}

// Línea de WhatsApp de CNE (instancia fija «cne-madrid»).
export async function crearLineaAccion(): Promise<EstadoSuper> {
  const sesion = await requireSuperadmin();
  const l = await crearLinea(sesion);
  revalidatePath("/superadmin/envios");
  if (l.error) return { error: l.error };
  return l.estado === "vinculada" ? { aviso: `La línea ya está vinculada${l.numero ? ` con ${l.numero}` : ""}.` } : { aviso: "Escanee el código con el WhatsApp del teléfono de CNE.", qr: l.qr ?? undefined };
}

export async function desvincularLineaAccion(): Promise<EstadoSuper> {
  const sesion = await requireSuperadmin();
  const r = await desvincularLinea(sesion);
  revalidatePath("/superadmin/envios");
  return r.ok ? { aviso: "Línea desvinculada. El envío real por WhatsApp quedó apagado." } : { error: r.mensaje };
}

// Interruptores del envío real por canal. Encender exige escribir «ENVIO REAL»; todo queda en la auditoría.
export async function interruptorEnvioAccion(_: EstadoSuper, f: FormData): Promise<EstadoSuper> {
  const sesion = await requireSuperadmin();
  const canal = f.get("canal") === "correo" ? "correo" : "whatsapp";
  const encender = f.get("destino") === "encender";
  const r = await cambiarInterruptor(sesion, canal, encender, String(f.get("confirmacion") ?? ""));
  revalidatePath("/superadmin/envios");
  if (!r.ok) return { error: r.mensaje };
  return { aviso: encender ? "Envío real encendido. Los mensajes de fichas reales saldrán en cola, con pausas." : "Envío real apagado. Todo vuelve a ser simulado." };
}

export async function reanudarEnviosAccion(_: EstadoSuper, f: FormData): Promise<EstadoSuper> {
  const sesion = await requireSuperadmin();
  await reanudarEnvios(sesion, f.get("canal") === "correo" ? "correo" : "whatsapp");
  revalidatePath("/superadmin/envios");
  return { aviso: "Envíos reanudados." };
}

export async function guardarRemitenteAccion(_: EstadoSuper, f: FormData): Promise<EstadoSuper> {
  const sesion = await requireSuperadmin();
  const r = await guardarRemitente(sesion, String(f.get("direccion") ?? ""), String(f.get("nombre") ?? ""));
  revalidatePath("/superadmin/envios");
  return r.ok ? { aviso: "Remitente guardado." } : { error: r.mensaje };
}

// Borra todas las fotos de cédula del modo actual. Exige la frase «BORRAR FOTOS»; queda en la auditoría con el recuento.
export async function borrarFotosAccion(_: EstadoSuper, f: FormData): Promise<EstadoSuper> {
  const sesion = await requireSuperadmin();
  const r = await borrarTodasLasFotos(sesion, String(f.get("confirmacion") ?? ""));
  revalidatePath("/superadmin");
  return r.ok ? { aviso: `Se borraron ${r.borradas} fotos de ${r.personas} personas. Finanzas volverá a pedir las fotos.` } : { error: r.mensaje };
}
