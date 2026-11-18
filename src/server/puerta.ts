import { query, withTx } from "./db";
import type { SesionEstacion } from "./estaciones";
import { ZONA_NOMBRE, type ZonaColor } from "../domain/juntas";

export type Lectura =
  | { resultado: "valido"; nombre: string; junta: string; zona: string }
  | { resultado: "duplicado"; desde: string }
  | { resultado: "desconocido" }
  | { resultado: "bloqueado" };

export const normalizarCodigo = (t: string) => t.trim().toUpperCase().replace(/\s+/g, "");

// Ingreso idempotente (01 §5): el índice único (mjrv_id, es_prueba) WHERE valido impide dos ingresos aunque dos puertas lean a la vez.
export async function registrarLectura(s: SesionEstacion, codigoBruto: string, dispositivo: string | null): Promise<Lectura> {
  const codigo = normalizarCodigo(codigoBruto).slice(0, 40);
  return withTx(async (client) => {
    const dev = (dispositivo ?? "").slice(0, 100) || null;
    const m = (await client.query<{ id: number; activo: boolean; apellidos: string; nombres: string }>("SELECT id, activo, apellidos, nombres FROM mjrv WHERE cedula = $1", [codigo])).rows[0];
    if (!m) {
      await client.query("INSERT INTO lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id, dispositivo) VALUES ($1, NULL, 'desconocido', $2, $3, $4)", [codigo, s.operadorId, s.enlaceId, dev]);
      return { resultado: "desconocido" as const };
    }
    const r = await client.query<{ resultado: string }>(
      `INSERT INTO lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id, dispositivo)
       VALUES ($1, $2, CASE WHEN $5 THEN 'valido' ELSE 'bloqueado' END, $3, $4, $6)
       ON CONFLICT (mjrv_id, es_prueba) WHERE resultado = 'valido' DO NOTHING RETURNING resultado`,
      [codigo, m.id, s.operadorId, s.enlaceId, m.activo, dev]);
    if (!r.rows[0]) {
      const previa = (await client.query<{ creado_en: string }>("SELECT creado_en::text FROM lecturas_puerta WHERE mjrv_id = $1 AND resultado = 'valido'", [m.id])).rows[0];
      await client.query("INSERT INTO lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id, dispositivo) VALUES ($1, $2, 'duplicado', $3, $4, $5)", [codigo, m.id, s.operadorId, s.enlaceId, dev]);
      return { resultado: "duplicado" as const, desde: previa.creado_en };
    }
    if (r.rows[0].resultado === "bloqueado") return { resultado: "bloqueado" as const };
    const j = (await client.query<{ serie: string; numero: number; zona_color: ZonaColor }>(
      `SELECT j.serie, j.numero, j.zona_color FROM juntas_madrid j WHERE j.id = coalesce(
         (SELECT d.junta_destino_id FROM decisiones_movimiento d WHERE d.mjrv_id = $1 AND d.decision = 'aceptada' ORDER BY d.creado_en DESC, d.id DESC LIMIT 1),
         (SELECT junta_origen_id FROM mjrv WHERE id = $1))`, [m.id])).rows[0];
    return { resultado: "valido" as const, nombre: `${m.apellidos}, ${m.nombres}`, junta: `${j.serie}${j.numero}`, zona: ZONA_NOMBRE[j.zona_color] };
  });
}

// Contadores del modo actual (el filtro de modo lo pone la RLS).
export async function contadoresPuerta(enlaceId: number): Promise<{ total: number; esteEnlace: number }> {
  const f = await query<{ total: number; este: number }>("SELECT count(*)::int AS total, count(*) FILTER (WHERE enlace_id = $1)::int AS este FROM lecturas_puerta WHERE resultado = 'valido'", [enlaceId]);
  return { total: f[0].total, esteEnlace: f[0].este };
}
