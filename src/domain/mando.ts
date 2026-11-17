// Estado de las 95 juntas (especificación §7.3, §13.5). Puro: sin base de datos.
import type { Serie, ZonaColor } from "./juntas";

export type JuntaEntrada = { id: number; serie: Serie; numero: number; zona: ZonaColor };
export type PersonaEntrada = {
  id: number; rol: string; junta_origen_id: number; junta_actual_id: number;
  ingresado: boolean; con_excepcion: boolean;
};
export type MovimientoEntrada = { junta_origen_id: number; junta_destino_id: number };

export const MINIMO_JUNTA = 3;
export type EstadoJunta = "nadie" | "faltan" | "completa";

export type JuntaMando = {
  id: number; serie: Serie; numero: number; zona: ZonaColor;
  presentes: number; estado: EstadoJunta; texto: string;
  movimiento: boolean; // ⇄ si hubo un traslado aceptado hacia o desde la junta
  transferibles: number; // suplentes presentes que sobran sin dejarla con menos de 3
};

export type Indicadores = { ingresados: number; total: number; completas: number; incompletas: number; sinNadie: number; transferibles: number };

// Disponible = ingresado y sin excepción activa (§7.2).
export const disponible = (p: PersonaEntrada) => p.ingresado && !p.con_excepcion;

export function textoEstado(presentes: number): { estado: EstadoJunta; texto: string } {
  if (presentes <= 0) return { estado: "nadie", texto: "Nadie" };
  if (presentes < MINIMO_JUNTA) return { estado: "faltan", texto: `Faltan ${MINIMO_JUNTA - presentes}` };
  return { estado: "completa", texto: `${presentes} presentes` };
}

export function calcularMando(juntas: JuntaEntrada[], personas: PersonaEntrada[], movimientos: MovimientoEntrada[]): { juntas: JuntaMando[]; indicadores: Indicadores } {
  const conMovimiento = new Set<number>();
  for (const m of movimientos) { conMovimiento.add(m.junta_origen_id); conMovimiento.add(m.junta_destino_id); }
  const presentes = new Map<number, number>();
  const suplentes = new Map<number, number>();
  for (const p of personas) {
    if (!disponible(p)) continue;
    presentes.set(p.junta_actual_id, (presentes.get(p.junta_actual_id) ?? 0) + 1);
    if (p.rol === "suplente") suplentes.set(p.junta_actual_id, (suplentes.get(p.junta_actual_id) ?? 0) + 1);
  }
  const resultado: JuntaMando[] = juntas.map((j) => {
    const n = presentes.get(j.id) ?? 0;
    return { ...j, presentes: n, ...textoEstado(n), movimiento: conMovimiento.has(j.id), transferibles: Math.max(0, Math.min(suplentes.get(j.id) ?? 0, n - MINIMO_JUNTA)) };
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

// «Faltan miembros»: primero a las que les falta 1, después 2, después nadie.
export function filtrarJuntas(juntas: JuntaMando[], filtro: Filtro): JuntaMando[] {
  const orden = (j: JuntaMando) => (j.estado === "faltan" ? j.presentes * -1 + 10 : j.estado === "nadie" ? 20 : 30); // faltan 1 → presentes 2
  const base = (j: JuntaMando) => `${j.serie === "H" ? 0 : 1}${String(j.numero).padStart(3, "0")}`;
  const lista = juntas.filter((j) => filtro === "todas" || (filtro === "faltan" && j.estado !== "completa") || (filtro === "transferibles" && j.transferibles > 0) || (filtro === "completas" && j.estado === "completa"));
  return lista.sort((a, b) => (filtro === "faltan" ? orden(a) - orden(b) : 0) || base(a).localeCompare(base(b)));
}
