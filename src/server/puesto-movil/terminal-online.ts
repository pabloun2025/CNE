import { query } from "../db";
import { ErrorJustificante } from "../justificante/servicio";

const instalacionValida = /^[0-9a-f]{16}$/;

export async function registrarConsultaMovil(id: string, tipo: "con" | "sin", instalacion: unknown) {
  if (instalacion === undefined) {
    await query("INSERT INTO cne.puesto_movil_actividad (id,tipo) VALUES ($1,$2)", [id, tipo]);
    return null;
  }
  if (typeof instalacion !== "string" || !instalacionValida.test(instalacion))
    throw new ErrorJustificante(400, "No se pudo identificar el navegador. Vuelva a cargar la página.");

  const [fila] = await query<{ terminal_online: number }>(`
    WITH existente AS (
      SELECT terminal FROM cne.puesto_terminal_online WHERE instalacion=$3
    ), alta AS (
      INSERT INTO cne.puesto_terminal_online (instalacion)
      SELECT $3 WHERE NOT EXISTS (SELECT 1 FROM existente)
      ON CONFLICT (instalacion) DO UPDATE SET instalacion=EXCLUDED.instalacion
      RETURNING terminal
    )
    INSERT INTO cne.puesto_movil_actividad (id,tipo,terminal_online)
    SELECT $1::uuid,$2::text,terminal FROM existente UNION ALL SELECT $1::uuid,$2::text,terminal FROM alta
    RETURNING terminal_online
  `, [id, tipo, instalacion]);
  return fila.terminal_online;
}
