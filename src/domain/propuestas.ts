// Motor de propuestas determinista (§7.3, §13.6). Una propuesta a la vez; la misma situación da siempre la misma.
import { MINIMO_JUNTA, disponible, type PersonaEntrada } from "./mando";
import type { Serie, ZonaColor } from "./juntas";

export type JuntaProp = { id: number; serie: Serie; numero: number; zona: ZonaColor; orden_cercania: number };
export type PersonaProp = PersonaEntrada & { apellidos: string; nombres: string; cedula: string };
export type DecisionProp = { mjrv_id: number; junta_destino_id: number; decision: "aceptada" | "pasada" | "no_viable"; rehabilitada: boolean };

export type Propuesta = {
  mjrvId: number; persona: string; cedula: string; rol: string;
  origenId: number; origen: string; origenZona: ZonaColor; origenQuedaria: number;
  destinoId: number; destino: string; destinoZona: ZonaColor; destinoPresentes: number;
  mismaZona: boolean; motivo: string;
};

const etiqueta = (j: JuntaProp) => `${j.serie}${j.numero}`;
const claveJunta = (j: JuntaProp) => `${j.serie === "H" ? 0 : 1}${String(j.numero).padStart(3, "0")}`;
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function proponer(juntas: JuntaProp[], personas: PersonaProp[], decisiones: DecisionProp[]): Propuesta | null {
  const porId = new Map(juntas.map((j) => [j.id, j]));
  const presentes = new Map<number, number>();
  for (const p of personas) if (disponible(p)) presentes.set(p.junta_actual_id, (presentes.get(p.junta_actual_id) ?? 0) + 1);
  const n = (id: number) => presentes.get(id) ?? 0;

  const pasadas = new Set(decisiones.filter((d) => d.decision === "pasada").map((d) => `${d.mjrv_id}:${d.junta_destino_id}`));
  const fuera = new Set(decisiones.filter((d) => d.decision === "no_viable" && !d.rehabilitada).map((d) => d.mjrv_id));

  // Destinos: con 1–2 presentes primero (menos faltantes antes), después los de 0.
  const destinos = juntas.filter((j) => n(j.id) < MINIMO_JUNTA);
  const prioridad = (j: JuntaProp) => (n(j.id) === 0 ? 2 : n(j.id) === 2 ? 0 : 1);
  // Candidatos: suplentes presentes cuyo origen conserva al menos 3 al irse.
  const candidatos = personas.filter((p) => p.rol === "suplente" && disponible(p) && n(p.junta_actual_id) > MINIMO_JUNTA && !fuera.has(p.id));

  const pares: { p: PersonaProp; o: JuntaProp; d: JuntaProp; clave: (string | number)[] }[] = [];
  for (const d of destinos) {
    for (const p of candidatos) {
      const o = porId.get(p.junta_actual_id);
      if (!o || o.id === d.id || pasadas.has(`${p.id}:${d.id}`)) continue;
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
  const quedaria = n(o.id) - 1;
  return {
    mjrvId: p.id, persona: `${p.apellidos}, ${p.nombres}`, cedula: p.cedula, rol: p.rol,
    origenId: o.id, origen: etiqueta(o), origenZona: o.zona, origenQuedaria: quedaria,
    destinoId: d.id, destino: etiqueta(d), destinoZona: d.zona, destinoPresentes: n(d.id),
    mismaZona: o.zona === d.zona,
    motivo: `${etiqueta(d)} tiene ${n(d.id)} ${n(d.id) === 1 ? "presente" : "presentes"}; ${etiqueta(o)} quedaría con ${quedaria}.`,
  };
}
