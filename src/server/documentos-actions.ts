"use server";

import { revalidatePath } from "next/cache";
import { fijarFormulario } from "./documentos";
import { requireSuperadmin } from "./guard";

export async function fijarFormularioAccion(f: FormData): Promise<void> {
  const sesion = await requireSuperadmin();
  const abierto = f.get("abierto") === "1";
  await fijarFormulario(sesion, abierto);
  revalidatePath("/superadmin/configuracion");
  revalidatePath("/admin/documentos");
  revalidatePath("/admin/credenciales");
}
