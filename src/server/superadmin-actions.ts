"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "./guard";
import { activarAdmin, cambiarModo, crearAdmin, restablecerAdmin } from "./superadmin";
import type { Modo } from "./config";
import { cargarDemo, quitarDemo } from "./demo";
import { prepararEleccion } from "./preparar-eleccion";
import { crearRespaldo } from "./respaldo";

export type EstadoSuper = { error?: string; aviso?: string; password?: string; enlace?: string; detalle?: string[] } | null;

export async function crearAdminAccion(_: EstadoSuper, f: FormData): Promise<EstadoSuper> {
  const sesion = await requireSuperadmin();
  const r = await crearAdmin(sesion, String(f.get("correo") ?? ""), String(f.get("nombre") ?? ""));
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
