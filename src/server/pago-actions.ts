"use server";

import { revalidatePath } from "next/cache";
import type { ParametrosPago } from "../domain/pago";
import { CONSUL_Y_FINANCIERO } from "../domain/roles";
import { requireAdmin } from "./guard";
import { guardarParametros } from "./pago";

export type EstadoPago = { error?: string; aviso?: string } | null;

export async function guardarParametrosAccion(_: EstadoPago, f: FormData): Promise<EstadoPago> {
  const sesion = await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  const campos = ["importe_eur", "pagador_nombre", "pagador_cargo", "lugar"] as const;
  const r = await guardarParametros(sesion, Object.fromEntries(campos.map((c) => [c, String(f.get(c) ?? "")])) as Record<keyof ParametrosPago, string>);
  revalidatePath("/admin/finanzas");
  return r.ok ? { aviso: "Parámetros guardados." } : { error: r.mensaje };
}
