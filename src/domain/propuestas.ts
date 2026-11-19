// Motor de propuestas determinista (§7.3, §13.6; decisión 9 del 18-11-2026). Una propuesta a la vez; la misma situación da siempre la misma.
// Orden para cubrir una vacante: 1.º suplente de la propia junta (automático, ver cargos.ts), 2.º suplente transferible de la misma zona,
// 3.º el de la zona más cercana, 4.º votante incorporado (a mano). Aquí se resuelven el 2.º y el 3.º.
import { cubrirCargos, ETIQUETA_CARGO, type AsignacionCargo, type Cargo, type PersonaCargo } from "./cargos";
import type { Serie, ZonaColor } from "./juntas";

export type JuntaProp = { id: number; serie: Serie; numero: number; zona: ZonaColor; orden_cercania: number };
export type PersonaProp = PersonaCargo & { apellidos: string; nombres: string; cedula: string };
export type DecisionProp = { mjrv_id: number; junta_destino_id: number; decision: "aceptada" | "pasada" | "no_viable"; rehabilitada: boolean; motivo?: string | null };

// «No quiere» saca a la persona de todos los huecos. «No contesta» y «ya no está» solo cierran ese hueco.
// Un motivo que no se reconoce sigue sacándola de todos, como antes de separar las tres frases.
export function efectoNoViable(motivo: string | null | undefined): "desiste" | "hueco" {
  const t = (motivo ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (/\bquiere\b|negativa/.test(t)) return "desiste";
  if (/contesta|sin_respuesta|\brespuesta\b|ya no esta|ausente/.test(t)) return "hueco";
  return "desiste";
}

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

// Una opción legal. El orden ya deja la misma zona y la más cercana primero; Ollama elige una de esta lista.
export type OpcionProp = {
  p: PersonaProp; o: JuntaProp; d: JuntaProp;
  vacantes: Cargo[]; quedaria: number; destinoPresentes: number; mismaZona: boolean; distancia: number;
};

// Juntas con alguien presente y algún cargo vacante: son las que piden ayuda (las de «nadie» no se cuentan aquí).
export function juntasConVacantes(juntas: JuntaProp[], personas: PersonaProp[], asignaciones: AsignacionCargo[]): number {
  const cob = cubrirCargos(juntas.map((j) => j.id), personas, asignaciones);
  return juntas.filter((j) => { const c = cob.get(j.id)!; return c.presentes.length > 0 && c.vacantes.length > 0; }).length;
}

export function opcionesPropuesta(juntas: JuntaProp[], personas: PersonaProp[], decisiones: DecisionProp[], asignaciones: AsignacionCargo[] = []): OpcionProp[] {
  const cob = cubrirCargos(juntas.map((j) => j.id), personas, asignaciones);
  const persona = new Map(personas.map((p) => [p.id, p]));

  const pasadas = new Set(decisiones.filter((d) => d.decision === "pasada").map((d) => `${d.mjrv_id}:${d.junta_destino_id}`));
  const noViable = decisiones.filter((d) => d.decision === "no_viable" && !d.rehabilitada);
  const fuera = new Set(noViable.filter((d) => efectoNoViable(d.motivo) === "desiste").map((d) => d.mjrv_id));
  const huecoCerrado = new Set(noViable.filter((d) => efectoNoViable(d.motivo) === "hueco").map((d) => `${d.mjrv_id}:${d.junta_destino_id}`));

  // Destinos: con una vacante primero, después dos, después tres.
  const destinos = juntas.filter((j) => cob.get(j.id)!.vacantes.length > 0);
  const prioridad = (j: JuntaProp) => cob.get(j.id)!.vacantes.length - 1;
  // Candidatos: suplentes de su propia junta que sobran con los tres cargos cubiertos (nunca uno que cubre un cargo).
  const candidatos = juntas.flatMap((o) => cob.get(o.id)!.transferibles.map((id) => ({ p: persona.get(id)!, o }))).filter(({ p }) => !fuera.has(p.id));

  const pares: (OpcionProp & { clave: (string | number)[] })[] = [];
  for (const d of destinos) {
    for (const { p, o } of candidatos) {
      if (o.id === d.id || pasadas.has(`${p.id}:${d.id}`) || huecoCerrado.has(`${p.id}:${d.id}`)) continue;
      const mismaZona = o.zona === d.zona;
      const distancia = Math.abs(o.orden_cercania - d.orden_cercania);
      pares.push({
        p, o, d, mismaZona, distancia,
        vacantes: cob.get(d.id)!.vacantes,
        quedaria: cob.get(o.id)!.presentes.length - 1,
        destinoPresentes: cob.get(d.id)!.presentes.length,
        clave: [prioridad(d), mismaZona ? 0 : 1, distancia, claveJunta(d), claveJunta(o), p.apellidos, p.cedula],
      });
    }
  }
  pares.sort((a, b) => {
    for (let i = 0; i < a.clave.length; i++) {
      const x = a.clave[i], y = b.clave[i];
      const c = typeof x === "number" ? x - (y as number) : cmp(x, y as string);
      if (c) return c;
    }
    return 0;
  });
  return pares;
}

export function armarPropuesta(op: OpcionProp): Propuesta {
  return {
    mjrvId: op.p.id, persona: `${op.p.apellidos}, ${op.p.nombres}`, cedula: op.p.cedula, rol: op.p.rol,
    origenId: op.o.id, origen: etiqueta(op.o), origenZona: op.o.zona, origenQuedaria: op.quedaria,
    destinoId: op.d.id, destino: etiqueta(op.d), destinoZona: op.d.zona, destinoPresentes: op.destinoPresentes,
    cargo: op.vacantes[0], vacantes: op.vacantes,
    mismaZona: op.mismaZona,
    motivo: `${etiqueta(op.d)} no tiene ${op.vacantes.map((c) => ETIQUETA_CARGO[c]).join(", ")}; ${etiqueta(op.o)} sigue completa (queda con ${op.quedaria}).`,
  };
}

export function proponer(juntas: JuntaProp[], personas: PersonaProp[], decisiones: DecisionProp[], asignaciones: AsignacionCargo[] = []): Propuesta | null {
  const primera = opcionesPropuesta(juntas, personas, decisiones, asignaciones)[0];
  return primera ? armarPropuesta(primera) : null;
}

export function propuestaElegida(opciones: OpcionProp[], mjrvId: number, destinoId: number): Propuesta | null {
  const op = opciones.find((o) => o.p.id === mjrvId && o.d.id === destinoId);
  return op ? armarPropuesta(op) : null;
}
