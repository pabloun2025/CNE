import { calcularMando, type JuntaMando, type Indicadores } from "../domain/mando";
import { query } from "./db";
import type { Serie, ZonaColor } from "../domain/juntas";

export type EstadoMando = { generado_en: string; indicadores: Indicadores; juntas: JuntaMando[] };

export async function estadoMando(): Promise<EstadoMando> {
  const juntas = await query<{ id: number; serie: Serie; numero: number; zona: ZonaColor }>("SELECT id, serie, numero, zona_color AS zona FROM juntas_madrid ORDER BY serie, numero");
  const personas = await query<{ id: number; rol: string; junta_origen_id: number; junta_actual_id: number; ingresado: boolean; con_excepcion: boolean }>(
    "SELECT m.id, m.rol, v.junta_origen_id, v.junta_actual_id, v.ingresado, v.con_excepcion FROM mjrv m JOIN v_mjrv_asignacion v ON v.mjrv_id = m.id");
  const movimientos = await query<{ junta_origen_id: number; junta_destino_id: number }>("SELECT DISTINCT junta_origen_id, junta_destino_id FROM decisiones_movimiento WHERE decision = 'aceptada'");
  return { generado_en: new Date().toISOString(), ...calcularMando(juntas, personas, movimientos) };
}

export type MiembroFicha = {
  id: number; nombre: string; rol: string; origen: string; actual: string; ingresado: boolean; con_excepcion: boolean; no_viable: boolean;
};
export type DetalleJunta = { junta: { id: number; etiqueta: string; zona: ZonaColor }; miembros: MiembroFicha[] };

// Ficha ampliada: asignados de origen y recibidos por traslado, con su situación.
export async function detalleJunta(juntaId: number): Promise<DetalleJunta | null> {
  const j = (await query<{ id: number; etiqueta: string; zona: ZonaColor }>("SELECT id, serie || numero AS etiqueta, zona_color AS zona FROM juntas_madrid WHERE id = $1", [juntaId]))[0];
  if (!j) return null;
  const miembros = await query<MiembroFicha>(
    `SELECT m.id, m.apellidos || ', ' || m.nombres AS nombre, m.rol, jo.serie || jo.numero AS origen, ja.serie || ja.numero AS actual, v.ingresado, v.con_excepcion,
            EXISTS (SELECT 1 FROM decisiones_movimiento d WHERE d.mjrv_id = m.id AND d.decision = 'no_viable' AND d.rehabilitada_en IS NULL) AS no_viable
       FROM mjrv m JOIN v_mjrv_asignacion v ON v.mjrv_id = m.id
       JOIN juntas_madrid jo ON jo.id = v.junta_origen_id JOIN juntas_madrid ja ON ja.id = v.junta_actual_id
      WHERE v.junta_origen_id = $1 OR v.junta_actual_id = $1
      ORDER BY (v.junta_origen_id = $1) DESC, array_position(ARRAY['presidente','secretario','vocal','suplente','otro'], m.rol), m.apellidos`, [juntaId]);
  return { junta: j, miembros };
}
