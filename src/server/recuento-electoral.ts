import { query } from "./db";

type CorteWindows = { equipo: number; total: number; sin: number };
type Equipo = { equipo: number | null; total: number; con: number; sin: number };
type Fila = Omit<Equipo, "equipo"> & { modo: "windows" | "enLinea"; equipo: string | null };

export async function guardarCorteWindows(corte: CorteWindows) {
  await query(`
    INSERT INTO cne.cortes_puesto_windows AS vigente (equipo,total,sin)
    VALUES ($1,$2,$3)
    ON CONFLICT (equipo) DO UPDATE SET total=EXCLUDED.total,sin=EXCLUDED.sin
    WHERE EXCLUDED.total > vigente.total
  `, [corte.equipo, corte.total, corte.sin]);
}

function resumir(detalle: Equipo[]) {
  return detalle.reduce((total, equipo) => ({
    equipos: total.equipos + Number(equipo.equipo !== null),
    total: total.total + equipo.total,
    con: total.con + equipo.con,
    sin: total.sin + equipo.sin,
  }), { equipos: 0, total: 0, con: 0, sin: 0 });
}

export async function recuentoElectoral() {
  const filas = await query<Fila>(`
    SELECT 'windows' AS modo,equipo,total,total-sin AS con,sin FROM cne.cortes_puesto_windows
    UNION ALL
    SELECT 'enLinea' AS modo,equipo,count(*)::int AS total,
      count(*) FILTER (WHERE tipo='con')::int AS con,
      count(*) FILTER (WHERE tipo='sin')::int AS sin
    FROM cne.puesto_movil_actividad GROUP BY equipo
    ORDER BY modo,equipo NULLS LAST
  `);
  const detalle = { windows: [] as Equipo[], enLinea: [] as Equipo[] };
  for (const { modo, equipo, ...totales } of filas) {
    detalle[modo].push({ equipo: equipo === null ? null : Number(equipo), ...totales });
  }
  return {
    total: resumir([...detalle.windows, ...detalle.enLinea]),
    windows: { ...resumir(detalle.windows), detalle: detalle.windows },
    enLinea: { ...resumir(detalle.enLinea), detalle: detalle.enLinea },
  };
}
