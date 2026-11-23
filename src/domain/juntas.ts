// Tipos y colores de las 95 juntas de Madrid (especificación, «Mapa de juntas de Madrid»).
export type Serie = "H" | "M";
export type ZonaColor = "amarillo" | "azul" | "rojo" | "celeste" | "verde" | "rosado";

export const ZONAS: ZonaColor[] = ["amarillo", "azul", "rojo", "celeste", "verde", "rosado"];

export const ZONA_NOMBRE: Record<ZonaColor, string> = {
  amarillo: "Amarillo", azul: "Azul", rojo: "Rojo", celeste: "Celeste", verde: "Verde", rosado: "Rosado",
};

// Colores de la franja de zona (distintos de los colores de estado verde/ámbar/rojo).
export const ZONA_HEX: Record<ZonaColor, string> = {
  amarillo: "#F2C200", azul: "#1F5FA8", rojo: "#C62828", celeste: "#4FC3F7", verde: "#2E7D32", rosado: "#F48FB1",
};

// Tramos por zona según la tabla «Numeración de las fichas».
export const TRAMOS: { serie: Serie; desde: number; hasta: number; zona: ZonaColor }[] = [
  { serie: "H", desde: 1, hasta: 21, zona: "amarillo" },
  { serie: "H", desde: 22, hasta: 41, zona: "azul" },
  { serie: "M", desde: 1, hasta: 8, zona: "rojo" },
  { serie: "M", desde: 9, hasta: 29, zona: "celeste" },
  { serie: "M", desde: 30, hasta: 39, zona: "verde" },
  { serie: "M", desde: 40, hasta: 54, zona: "rosado" },
];

export const TOTAL_JUNTAS = 95;

export function etiquetaJunta(serie: Serie, numero: number): string {
  return `${serie}${numero}`;
}

// La serie interna H/M identifica el padrón. La credencial usa Masculino/Femenino.
export function juntaEnCredencial(serie: Serie, numero: number | string): string {
  return `${serie === "M" ? "F" : "M"}${numero}`;
}

export function rotuloCredencial(rotulo: string | null, junta: string): string {
  return rotulo?.trim() || junta;
}

export function zonaDe(serie: Serie, numero: number): ZonaColor | null {
  return TRAMOS.find((t) => t.serie === serie && numero >= t.desde && numero <= t.hasta)?.zona ?? null;
}

// Lee «H12», «m 3» o «M07». Devuelve null si no es una junta existente (H42, M55…).
export function leerJunta(texto: string): { serie: Serie; numero: number } | null {
  const m = /^\s*([HhMm])\s*0*(\d{1,3})\s*$/.exec(texto);
  if (!m) return null;
  const serie = m[1].toUpperCase() as Serie;
  const numero = Number(m[2]);
  return zonaDe(serie, numero) ? { serie, numero } : null;
}
