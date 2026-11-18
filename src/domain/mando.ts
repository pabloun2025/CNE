// Estado de las 95 juntas (especificación §7.3, §13.5; decisión 9 del 18-11-2026). Puro: sin base de datos.
import { cubrirCargos, textoVacantes, type AsignacionCargo, type Cargo, type PersonaCargo } from "./cargos";
import type { Serie, ZonaColor } from "./juntas";

export type JuntaEntrada = { id: number; serie: Serie; numero: number; zona: ZonaColor };
export type PersonaEntrada = PersonaCargo;
export type MovimientoEntrada = { junta_origen_id: number; junta_destino_id: number };

// Rojo: nadie presente. Ámbar: alguien presente pero falta algún cargo. Verde: los tres cargos cubiertos.
export type EstadoJunta = "nadie" | "faltan" | "completa";

export type JuntaMando = {
  id: number; serie: Serie; numero: number; zona: ZonaColor;
  presentes: number; estado: EstadoJunta; texto: string;
  vacantes: Cargo[];
  movimiento: boolean; // ⇄ si hubo un traslado aceptado hacia o desde la junta
  transferibles: number; // suplentes de la propia junta presentes que sobran con los tres cargos cubiertos
};

export type Indicadores = { ingresados: number; total: number; completas: number; incompletas: number; sinNadie: number; transferibles: number };

// Provisional: lo usan las propuestas y traslados hasta D10 (que pasan a razonar por cargos).
export const MINIMO_JUNTA = 3;

// Disponible = ingresado y sin excepción activa (§7.2).
export const disponible = (p: PersonaEntrada) => p.ingresado && !p.con_excepcion;

export function calcularMando(juntas: JuntaEntrada[], personas: PersonaEntrada[], movimientos: MovimientoEntrada[], asignaciones: AsignacionCargo[] = []): { juntas: JuntaMando[]; indicadores: Indicadores } {
  const conMovimiento = new Set<number>();
  for (const m of movimientos) { conMovimiento.add(m.junta_origen_id); conMovimiento.add(m.junta_destino_id); }
  const cobertura = cubrirCargos(juntas.map((j) => j.id), personas, asignaciones);
  const resultado: JuntaMando[] = juntas.map((j) => {
    const c = cobertura.get(j.id)!;
    const n = c.presentes.length;
    const estado: EstadoJunta = n === 0 ? "nadie" : c.vacantes.length === 0 ? "completa" : "faltan";
    const texto = estado === "nadie" ? "Nadie" : estado === "completa" ? "Completa" : textoVacantes(c.vacantes);
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

// «Faltan miembros»: primero a las que les falta un cargo, después dos, después tres (nadie).
export function filtrarJuntas(juntas: JuntaMando[], filtro: Filtro): JuntaMando[] {
  const base = (j: JuntaMando) => `${j.serie === "H" ? 0 : 1}${String(j.numero).padStart(3, "0")}`;
  const lista = juntas.filter((j) => filtro === "todas" || (filtro === "faltan" && j.estado !== "completa") || (filtro === "transferibles" && j.transferibles > 0) || (filtro === "completas" && j.estado === "completa"));
  return lista.sort((a, b) => (filtro === "faltan" ? a.vacantes.length - b.vacantes.length : 0) || base(a).localeCompare(base(b)));
}
