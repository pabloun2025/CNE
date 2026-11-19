"use server";

import { revalidatePath } from "next/cache";
import type { ParametrosPago } from "../domain/pago";
import { CONSUL_Y_FINANCIERO } from "../domain/roles";
import { requireAdmin } from "./guard";
import { guardarParametros, leerParametros } from "./pago";

export type EstadoPago = { error?: string; aviso?: string } | null;

export async function guardarParametrosAccion(_: EstadoPago, f: FormData): Promise<EstadoPago> {
  const sesion = await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  const actuales = await leerParametros();
  const entrada: Record<keyof ParametrosPago, string> = {
    importe_eur: String(f.get("importe_eur") ?? ""),
    pagador_nombre: String(f.get("pagador_nombre") ?? ""),
    pagador_cargo: actuales.pagador_cargo ?? "",
    lugar: actuales.lugar ?? "",
  };
  const r = await guardarParametros(sesion, entrada);
  revalidatePath("/admin/configuracion");
  revalidatePath("/admin/finanzas");
  return r.ok ? { aviso: "Configuración guardada." } : { error: r.mensaje };
}
