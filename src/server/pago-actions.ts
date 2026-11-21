"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "./guard";
import { guardarParametros } from "./pago";

export type EstadoPago = { error?: string; aviso?: string } | null;

export async function guardarParametrosAccion(_: EstadoPago, f: FormData): Promise<EstadoPago> {
  const sesion = await requireSuperadmin();
  const resultado = await guardarParametros(sesion, {
    pagador_nombre: String(f.get("pagador_nombre") ?? ""),
    pagador_cargo: String(f.get("pagador_cargo") ?? ""),
  });
  revalidatePath("/superadmin/configuracion");
  revalidatePath("/admin/finanzas");
  return resultado.ok ? { aviso: "Firmante guardado." } : { error: resultado.mensaje };
}
