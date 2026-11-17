// Datos de demostración: evidentemente ficticios y rotulados como prueba (AGENTS.md, «No inventar datos»).
import type { Serie } from "./juntas";

export const FUENTE_DEMO = "DEMO — rótulo provisional (P-5)";
const CARGOS = ["PRESIDENTE", "SECRETARIO", "VOCAL", "SUPLENTE", "SUPLENTE", "SUPLENTE"] as const;
const ROLES = ["presidente", "secretario", "vocal", "suplente", "suplente", "suplente"] as const;
// La cifra 6 por junta es solo de demostración.
export const FICHAS_POR_JUNTA = CARGOS.length;

export type FichaDemo = {
  cedula: string; apellidos: string; nombres: string; cargo: string; rol: string;
  serie: Serie; numero: number; rotulo: string; fuente: string;
};

const rellenar = (n: number, ancho: number) => String(n).padStart(ancho, "0");

// `juntas` debe venir en orden estable (H1…H41 y M1…M54) para que las cédulas sean siempre las mismas.
export function generarDemo(juntas: { serie: Serie; numero: number }[]): FichaDemo[] {
  const ordenadas = [...juntas].sort((a, b) => (a.serie === b.serie ? a.numero - b.numero : a.serie === "H" ? -1 : 1));
  return ordenadas.flatMap((j, i) =>
    CARGOS.map((cargo, k) => {
      const n = i * FICHAS_POR_JUNTA + k + 1;
      return {
        cedula: rellenar(n, 10),
        apellidos: `APELLIDO PRUEBA ${rellenar(n, 3)}`,
        nombres: "NOMBRE PRUEBA",
        cargo,
        rol: ROLES[k],
        serie: j.serie,
        numero: j.numero,
        rotulo: `${j.serie}${rellenar(j.numero, 2)}`,
        fuente: FUENTE_DEMO,
      };
    }),
  );
}
