"use server";

import { revalidatePath } from "next/cache";
import { leerMedidasCredencial } from "../domain/credencial-layout";
import { guardarMedidasCredencial } from "./credencial-config";
import { requireSuperadmin } from "./guard";

export type EstadoMedidasCredencial = { error?: string; aviso?: string } | null;

export async function guardarMedidasCredencialAccion(_: EstadoMedidasCredencial, form: FormData): Promise<EstadoMedidasCredencial> {
  const sesion = await requireSuperadmin();
  const medidas = leerMedidasCredencial(String(form.get("ancho") ?? ""), String(form.get("alto") ?? ""));
  if (!medidas) return { error: "Indique las medidas en milímetros, con hasta dos decimales. La credencial debe caber en 200 × 287 mm, incluso si se gira." };
  await guardarMedidasCredencial(sesion, medidas);
  revalidatePath("/superadmin/configuracion");
  revalidatePath("/admin/credenciales");
  return { aviso: "Medidas guardadas." };
}
