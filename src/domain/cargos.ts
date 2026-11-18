// Tres cargos por junta, siempre cubiertos (decisión 9 del 18-11-2026, 09 §3.4). Puro y determinista: sin base de datos.
export type Cargo = "presidente" | "secretario" | "vocal";
export const CARGOS: Cargo[] = ["presidente", "secretario", "vocal"];
export const ETIQUETA_CARGO: Record<Cargo, string> = { presidente: "presidente", secretario: "secretario", vocal: "vocal" };

export type TipoCobertura = "titular" | "suplente_junta" | "traslado" | "incorporado" | "manual";

export type PersonaCargo = {
  id: number; rol: string; junta_origen_id: number; junta_actual_id: number;
  ingresado: boolean; con_excepcion: boolean;
  fila_origen?: number | null; apellidos?: string;
};
export type AsignacionCargo = { mjrv_id: number; junta_id: number; cargo: Cargo; origen: "traslado" | "incorporado" | "manual" };

export type CoberturaCargo = { cargo: Cargo; mjrvId: number | null; tipo: TipoCobertura | null };
export type CoberturaJunta = {
  juntaId: number;
  cargos: CoberturaCargo[]; // siempre los tres, en orden presidente, secretario, vocal
  vacantes: Cargo[];
  presentes: number[]; // ids de las personas disponibles en la junta
  sinCargo: number[]; // presentes que no cubren ningún cargo
  transferibles: number[]; // suplentes de la propia junta presentes que sobran (solo hay si la junta está completa)
};

// Disponible = ingresada y sin excepción activa (§7.2).
const disponible = (p: PersonaCargo) => p.ingresado && !p.con_excepcion;
const orden = (a: PersonaCargo, b: PersonaCargo) =>
  (a.fila_origen ?? Number.MAX_SAFE_INTEGER) - (b.fila_origen ?? Number.MAX_SAFE_INTEGER) || (a.apellidos ?? "").localeCompare(b.apellidos ?? "") || a.id - b.id;

// Para cada junta, quién cubre cada cargo:
// 1. Asignación explícita activa (traslado, votante incorporado o a mano) de una persona presente en la junta.
// 2. Titular de la propia junta con ese rol (si llega tarde un titular de un cargo ya cubierto por un sustituto explícito,
//    el sustituto lo conserva y el titular queda presente sin cargo).
// 3. Suplente de la propia junta, en orden presidente → secretario → vocal, por fila del Excel, apellidos e id.
// 4. Lo que queda es vacante.
export function cubrirCargos(juntaIds: number[], personas: PersonaCargo[], asignaciones: AsignacionCargo[]): Map<number, CoberturaJunta> {
  const resultado = new Map<number, CoberturaJunta>();
  for (const juntaId of juntaIds) {
    const aqui = personas.filter((p) => disponible(p) && p.junta_actual_id === juntaId).sort(orden);
    const porId = new Map(aqui.map((p) => [p.id, p]));
    const cubre = new Map<Cargo, CoberturaCargo>();
    const usadas = new Set<number>();

    // 1. Explícitas (una por cargo y por persona; ante datos incoherentes gana la de menor id de persona).
    for (const a of [...asignaciones].filter((x) => x.junta_id === juntaId).sort((x, y) => x.mjrv_id - y.mjrv_id)) {
      if (!porId.has(a.mjrv_id) || usadas.has(a.mjrv_id) || cubre.has(a.cargo)) continue;
      cubre.set(a.cargo, { cargo: a.cargo, mjrvId: a.mjrv_id, tipo: a.origen });
      usadas.add(a.mjrv_id);
    }
    const propias = aqui.filter((p) => p.junta_origen_id === juntaId);
    // 2. Titulares de la propia junta.
    for (const cargo of CARGOS) {
      if (cubre.has(cargo)) continue;
      const t = propias.find((p) => p.rol === cargo && !usadas.has(p.id));
      if (t) { cubre.set(cargo, { cargo, mjrvId: t.id, tipo: "titular" }); usadas.add(t.id); }
    }
    // 3. Suplentes de la propia junta.
    for (const cargo of CARGOS) {
      if (cubre.has(cargo)) continue;
      const s = propias.find((p) => p.rol === "suplente" && !usadas.has(p.id));
      if (s) { cubre.set(cargo, { cargo, mjrvId: s.id, tipo: "suplente_junta" }); usadas.add(s.id); }
    }
    const cargos = CARGOS.map((cargo) => cubre.get(cargo) ?? { cargo, mjrvId: null, tipo: null });
    resultado.set(juntaId, {
      juntaId, cargos,
      vacantes: cargos.filter((c) => c.mjrvId === null).map((c) => c.cargo),
      presentes: aqui.map((p) => p.id),
      sinCargo: aqui.filter((p) => !usadas.has(p.id)).map((p) => p.id),
      transferibles: propias.filter((p) => p.rol === "suplente" && !usadas.has(p.id)).map((p) => p.id),
    });
  }
  return resultado;
}

export function textoVacantes(vacantes: Cargo[]): string {
  if (vacantes.length === 0) return "";
  if (vacantes.length === 1) return `Falta ${vacantes[0]}`;
  return `Faltan ${vacantes.slice(0, -1).join(", ")} y ${vacantes[vacantes.length - 1]}`;
}
