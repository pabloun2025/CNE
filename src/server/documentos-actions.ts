"use server";

import { revalidatePath } from "next/cache";
import { fijarFormulario } from "./documentos";
import { requireAdmin } from "./guard";
import { registrarAuditoria } from "./auditoria";

export async function fijarFormularioAccion(f: FormData): Promise<void> {
  const sesion = await requireAdmin();
  const abierto = f.get("abierto") === "1";
  await fijarFormulario(abierto, sesion.usuarioId);
  await registrarAuditoria({ portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: abierto ? "formulario_documentos_abierto" : "formulario_documentos_cerrado" });
  revalidatePath("/admin/documentos");
}
