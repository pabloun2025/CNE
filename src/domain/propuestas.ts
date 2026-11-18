// Motor de propuestas determinista (§7.3, §13.6; decisión 9 del 18-11-2026). Una propuesta a la vez; la misma situación da siempre la misma.
// Orden para cubrir una vacante: 1.º suplente de la propia junta (automático, ver cargos.ts), 2.º suplente transferible de la misma zona,
// 3.º el de la zona más cercana, 4.º votante incorporado (a mano). Aquí se resuelven el 2.º y el 3.º.
import { cubrirCargos, ETIQUETA_CARGO, type AsignacionCargo, type Cargo, type PersonaCargo } from "./cargos";
import type { Serie, ZonaColor } from "./juntas";

export type JuntaProp = { id: number; serie: Serie; numero: number; zona: ZonaColor; orden_cercania: number };
export type PersonaProp = PersonaCargo & { apellidos: string; nombres: string; cedula: string };
export type DecisionProp = { mjrv_id: number; junta_destino_id: number; decision: "aceptada" | "pasada" | "no_viable"; rehabilitada: boolean };

export type Propuesta = {
  mjrvId: number; persona: string; cedula: string; rol: string;
  origenId: number; origen: string; origenZona: ZonaColor; origenQuedaria: number;
  destinoId: number; destino: string; destinoZona: ZonaColor; destinoPresentes: number;
  cargo: Cargo; // primera vacante del destino (editable en la tarjeta)
  vacantes: Cargo[]; // todas las vacantes del destino
  mismaZona: boolean; motivo: string;
};

const etiqueta = (j: JuntaProp) => `${j.serie}${j.numero}`;
const claveJunta = (j: JuntaProp) => `${j.serie === "H" ? 0 : 1}${String(j.numero).padStart(3, "0")}`;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// Juntas con alguien presente y algún cargo vacante: son las que piden ayuda (las de «nadie» no se cuentan aquí).
export function juntasConVacantes(juntas: JuntaProp[], personas: PersonaProp[], asignaciones: AsignacionCargo[]): number {
  const cob = cubrirCargos(juntas.map((j) => j.id), personas, asignaciones);
  return juntas.filter((j) => { const c = cob.get(j.id)!; return c.presentes.length > 0 && c.vacantes.length > 0; }).length;
}

export function proponer(juntas: JuntaProp[], personas: PersonaProp[], decisiones: DecisionProp[], asignaciones: AsignacionCargo[] = []): Propuesta | null {
  const cob = cubrirCargos(juntas.map((j) => j.id), personas, asignaciones);
  const persona = new Map(personas.map((p) => [p.id, p]));

  const pasadas = new Set(decisiones.filter((d) => d.decision === "pasada").map((d) => `${d.mjrv_id}:${d.junta_destino_id}`));
  const fuera = new Set(decisiones.filter((d) => d.decision === "no_viable" && !d.rehabilitada).map((d) => d.mjrv_id));

  // Destinos: con una vacante primero, después dos, después tres.
  const destinos = juntas.filter((j) => cob.get(j.id)!.vacantes.length > 0);
  const prioridad = (j: JuntaProp) => cob.get(j.id)!.vacantes.length - 1;
  // Candidatos: suplentes de su propia junta que sobran con los tres cargos cubiertos (nunca uno que cubre un cargo).
  const candidatos = juntas.flatMap((o) => cob.get(o.id)!.transferibles.map((id) => ({ p: persona.get(id)!, o }))).filter(({ p }) => !fuera.has(p.id));

  const pares: { p: PersonaProp; o: JuntaProp; d: JuntaProp; clave: (string | number)[] }[] = [];
  for (const d of destinos) {
    for (const { p, o } of candidatos) {
      if (o.id === d.id || pasadas.has(`${p.id}:${d.id}`)) continue;
      const misma = o.zona === d.zona;
      pares.push({ p, o, d, clave: [prioridad(d), misma ? 0 : 1, Math.abs(o.orden_cercania - d.orden_cercania), claveJunta(d), claveJunta(o), p.apellidos, p.cedula] });
    }
  }
  if (pares.length === 0) return null;
  pares.sort((a, b) => {
    for (let i = 0; i < a.clave.length; i++) {
      const x = a.clave[i], y = b.clave[i];
      const c = typeof x === "number" ? x - (y as number) : cmp(x, y as string);
      if (c) return c;
    }
    return 0;
  });
  const { p, o, d } = pares[0];
  const vacantes = cob.get(d.id)!.vacantes;
  const quedaria = cob.get(o.id)!.presentes.length - 1;
  return {
    mjrvId: p.id, persona: `${p.apellidos}, ${p.nombres}`, cedula: p.cedula, rol: p.rol,
    origenId: o.id, origen: etiqueta(o), origenZona: o.zona, origenQuedaria: quedaria,
    destinoId: d.id, destino: etiqueta(d), destinoZona: d.zona, destinoPresentes: cob.get(d.id)!.presentes.length,
    cargo: vacantes[0], vacantes,
    mismaZona: o.zona === d.zona,
    motivo: `${etiqueta(d)} no tiene ${vacantes.map((c) => ETIQUETA_CARGO[c]).join(", ")}; ${etiqueta(o)} sigue completa (queda con ${quedaria}).`,
  };
}
