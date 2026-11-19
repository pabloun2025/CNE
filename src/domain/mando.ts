// Estado de las 95 juntas (especificación §7.3, §13.5; decisión 9 del 18-11-2026). Puro: sin base de datos.
import { cubrirCargos, type AsignacionCargo, type Cargo, type PersonaCargo } from "./cargos";
import { ZONA_NOMBRE, ZONAS, type Serie, type ZonaColor } from "./juntas";

export type JuntaEntrada = { id: number; serie: Serie; numero: number; zona: ZonaColor };
export type PersonaEntrada = PersonaCargo;
export type MovimientoEntrada = { junta_origen_id: number; junta_destino_id: number };

// Aro: rojo si no hay nadie, ámbar si hay menos de 3, verde si hay 3 o más presentes. No mira los cargos.
export type EstadoJunta = "nadie" | "faltan" | "completa";

export type JuntaMando = {
  id: number; serie: Serie; numero: number; zona: ZonaColor;
  presentes: number; estado: EstadoJunta; texto: string;
  vacantes: Cargo[];
  movimiento: boolean; // ⇄ si hubo un traslado aceptado hacia o desde la junta
  transferibles: number; // suplentes de la propia junta presentes que sobran con los tres cargos cubiertos
};

export type Indicadores = { ingresados: number; total: number; completas: number; incompletas: number; sinNadie: number; transferibles: number };

// Disponible = ingresado y sin excepción activa (§7.2).
export const disponible = (p: PersonaEntrada) => p.ingresado && !p.con_excepcion;

export function calcularMando(juntas: JuntaEntrada[], personas: PersonaEntrada[], movimientos: MovimientoEntrada[], asignaciones: AsignacionCargo[] = []): { juntas: JuntaMando[]; indicadores: Indicadores } {
  const conMovimiento = new Set<number>();
  for (const m of movimientos) { conMovimiento.add(m.junta_origen_id); conMovimiento.add(m.junta_destino_id); }
  const cobertura = cubrirCargos(juntas.map((j) => j.id), personas, asignaciones);
  const resultado: JuntaMando[] = juntas.map((j) => {
    const c = cobertura.get(j.id)!;
    const n = c.presentes.length;
    const estado: EstadoJunta = n === 0 ? "nadie" : n >= 3 ? "completa" : "faltan";
    const texto = estado === "nadie" ? "Nadie" : estado === "completa" ? "3 presentes" : "Falta gente";
    return { ...j, presentes: n, estado, texto, vacantes: c.vacantes, movimiento: conMovimiento.has(j.id), transferibles: c.transferibles.length };
  });
  return {
    juntas: resultado,
    indicadores: {
      ingresados: personas.filter((p) => p.ingresado).length,
      total: personas.length,
      completas: resultado.filter((j) => j.estado === "completa").length,
      incompletas: resultado.filter((j) => j.estado === "faltan").length,
      sinNadie: resultado.filter((j) => j.estado === "nadie").length,
      transferibles: resultado.reduce((s, j) => s + j.transferibles, 0),
    },
  };
}

export type Filtro = "faltan" | "transferibles" | "completas" | "todas";

// Infograma, no plano: una faja por color, sin partir en dos filas ni marcar la entrada.
// Primero la zona con más cargos por cubrir; dentro, la junta con menos vacantes (la que la asignación mira antes) y al final las que ya no piden a nadie.
export function gruposInfograma(juntas: JuntaMando[]): { zona: ZonaColor; titulo: string; fichas: JuntaMando[] }[] {
  const porZona = new Map<ZonaColor, JuntaMando[]>();
  for (const j of juntas) porZona.set(j.zona, [...(porZona.get(j.zona) ?? []), j]);
  const urgencia = (j: JuntaMando) => (j.vacantes.length === 0 ? 99 : j.vacantes.length);
  const serie = (j: JuntaMando) => (j.serie === "H" ? 0 : 1);
  return [...porZona.entries()]
    .map(([zona, fichas]) => {
      const ordenadas = [...fichas].sort((a, b) => urgencia(a) - urgencia(b) || serie(a) - serie(b) || a.numero - b.numero);
      return { zona, titulo: ZONA_NOMBRE[zona], fichas: ordenadas, necesidad: ordenadas.reduce((s, j) => s + j.vacantes.length, 0) };
    })
    .sort((a, b) => b.necesidad - a.necesidad || ZONAS.indexOf(a.zona) - ZONAS.indexOf(b.zona))
    .map(({ zona, titulo, fichas }) => ({ zona, titulo, fichas }));
}

// «Faltan miembros»: primero a las que les falta un cargo, después dos, después tres (nadie).
export function filtrarJuntas(juntas: JuntaMando[], filtro: Filtro): JuntaMando[] {
  const base = (j: JuntaMando) => `${j.serie === "H" ? 0 : 1}${String(j.numero).padStart(3, "0")}`;
  const lista = juntas.filter((j) => filtro === "todas" || (filtro === "faltan" && j.estado !== "completa") || (filtro === "transferibles" && j.transferibles > 0) || (filtro === "completas" && j.estado === "completa"));
  return lista.sort((a, b) => (filtro === "faltan" ? a.vacantes.length - b.vacantes.length : 0) || base(a).localeCompare(base(b)));
}
