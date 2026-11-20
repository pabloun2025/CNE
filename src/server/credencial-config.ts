import { CR80, leerMedidasCredencial, type MedidasCredencial } from "../domain/credencial-layout";
import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { query, withTx } from "./db";

export async function medidasCredencial(): Promise<MedidasCredencial> {
  const [fila] = await query<{ ancho: string; alto: string }>(
    "SELECT credencial_ancho_mm AS ancho, credencial_alto_mm AS alto FROM configuracion WHERE id = 1",
  );
  return fila ? leerMedidasCredencial(fila.ancho, fila.alto) ?? CR80 : CR80;
}

export async function guardarMedidasCredencial(sesion: Sesion, medidas: MedidasCredencial): Promise<void> {
  if (sesion.tipo !== "madrid_admin" || sesion.rol !== "consul") throw new Error("Solo el cónsul puede configurar las credenciales.");
  await withTx(async (client) => {
    await client.query(
      "UPDATE configuracion SET credencial_ancho_mm = $1, credencial_alto_mm = $2, actualizado_en = now(), actualizado_por = $3 WHERE id = 1",
      [medidas.ancho, medidas.alto, sesion.usuarioId],
    );
    await registrarAuditoria({ portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "medidas_credencial_guardadas", entidad: "configuracion", entidadId: 1, datos: medidas }, client);
  });
}
