import { cubrirCargos, type AsignacionCargo, type Cargo, type PersonaCargo, type TipoCobertura } from "../domain/cargos";
import { calcularMando, type JuntaMando, type Indicadores } from "../domain/mando";
import { query, withTx } from "./db";
import type { Modo } from "./config";
import type { Serie, ZonaColor } from "../domain/juntas";

export type EstadoMando = { generado_en: string; indicadores: Indicadores; juntas: JuntaMando[]; modo: Modo };

export const PERSONAS_CARGO = `SELECT m.id, m.rol, m.fila_origen, m.apellidos, v.junta_origen_id, v.junta_actual_id, v.ingresado, v.con_excepcion
       FROM mjrv m JOIN v_mjrv_asignacion v ON v.mjrv_id = m.id`;
const ASIGNACIONES = "SELECT mjrv_id, junta_id, cargo, origen FROM asignaciones_cargo WHERE activa";
export const leerAsignaciones = () => query<AsignacionCargo>(ASIGNACIONES);

export async function estadoMando(): Promise<EstadoMando> {
  return withTx(async (client) => {
    // El aviso de modo y el estado deben corresponder a la misma lectura.
    await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const { rows: [config] } = await client.query<{ modo: Modo }>("SELECT modo FROM configuracion WHERE id = 1");
    const { rows: juntas } = await client.query<{ id: number; serie: Serie; numero: number; zona: ZonaColor }>("SELECT id, serie, numero, zona_color AS zona FROM juntas_madrid ORDER BY serie, numero");
    const { rows: personas } = await client.query<PersonaCargo>(PERSONAS_CARGO);
    const { rows: movimientos } = await client.query<{ junta_origen_id: number; junta_destino_id: number }>("SELECT DISTINCT junta_origen_id, junta_destino_id FROM decisiones_movimiento WHERE decision = 'aceptada'");
    const { rows: asignaciones } = await client.query<AsignacionCargo>(ASIGNACIONES);
    return { generado_en: new Date().toISOString(), modo: config?.modo ?? "prueba", ...calcularMando(juntas, personas, movimientos, asignaciones) };
  });
}

export type MiembroFicha = {
  id: number; nombre: string; rol: string; origen: string; actual: string; ingresado: boolean; con_excepcion: boolean; no_viable: boolean;
  incorporado: boolean; cargo: Cargo | null;
};
export type CargoFicha = { cargo: Cargo; mjrvId: number | null; nombre: string | null; tipo: TipoCobertura | null; etiqueta: string | null };
export type DetalleJunta = {
  junta: { id: number; etiqueta: string; zona: ZonaColor }; miembros: MiembroFicha[];
  cargos: CargoFicha[]; sinCargo: { id: number; nombre: string; rol: string }[];
};

const ETIQUETA_TIPO: Record<Exclude<TipoCobertura, "traslado">, string> = { titular: "Titular", suplente_junta: "Suplente de la junta", incorporado: "Votante incorporado", manual: "Asignado a mano" };

// Ficha ampliada: los tres cargos con quién los cubre, y los asignados de origen y recibidos por traslado con su situación.
export async function detalleJunta(juntaId: number): Promise<DetalleJunta | null> {
  const j = (await query<{ id: number; etiqueta: string; zona: ZonaColor }>("SELECT id, serie || numero AS etiqueta, zona_color AS zona FROM juntas_madrid WHERE id = $1", [juntaId]))[0];
  if (!j) return null;
  const miembros = await query<Omit<MiembroFicha, "cargo">>(
    `SELECT m.id, m.apellidos || ', ' || m.nombres AS nombre, m.rol, jo.serie || jo.numero AS origen, ja.serie || ja.numero AS actual, v.ingresado, v.con_excepcion,
            EXISTS (SELECT 1 FROM decisiones_movimiento d WHERE d.mjrv_id = m.id AND d.decision = 'no_viable' AND d.rehabilitada_en IS NULL) AS no_viable,
            (m.incorporado_en IS NOT NULL) AS incorporado
       FROM mjrv m JOIN v_mjrv_asignacion v ON v.mjrv_id = m.id
       JOIN juntas_madrid jo ON jo.id = v.junta_origen_id JOIN juntas_madrid ja ON ja.id = v.junta_actual_id
      WHERE v.junta_origen_id = $1 OR v.junta_actual_id = $1
      ORDER BY (v.junta_origen_id = $1) DESC, array_position(ARRAY['presidente','secretario','vocal','suplente','otro'], m.rol), m.apellidos`, [juntaId]);
  const personas = await query<PersonaCargo>(PERSONAS_CARGO);
  const c = cubrirCargos([juntaId], personas, await leerAsignaciones()).get(juntaId)!;
  const porId = new Map(miembros.map((m) => [m.id, m]));
  const cubierto = new Map(c.cargos.filter((x) => x.mjrvId !== null).map((x) => [x.mjrvId!, x.cargo]));
  return {
    junta: j,
    miembros: miembros.map((m) => ({ ...m, cargo: cubierto.get(m.id) ?? null })),
    cargos: c.cargos.map((x) => {
      const m = x.mjrvId === null ? null : porId.get(x.mjrvId) ?? null;
      const etiqueta = x.tipo === null ? null : x.tipo === "traslado" ? `Trasladado desde ${m?.origen ?? "otra junta"}` : ETIQUETA_TIPO[x.tipo];
      return { cargo: x.cargo, mjrvId: x.mjrvId, nombre: m?.nombre ?? null, tipo: x.tipo, etiqueta };
    }),
    sinCargo: c.sinCargo.flatMap((id) => { const m = porId.get(id); return m ? [{ id, nombre: m.nombre, rol: m.rol }] : []; }),
  };
}
