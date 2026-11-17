// Medidas de la credencial CR80 vertical y de la hoja A4 (02 §C.9). Todo en milímetros desde el borde superior izquierdo.
export const MM = 72 / 25.4; // puntos por milímetro
export const CR80 = { ancho: 54, alto: 85.6 } as const;
export const A4 = { ancho: 210, alto: 297 } as const;

export type Rect = { x: number; y: number; w: number; h: number };

// Girada 90°, cada credencial ocupa 85,6 × 54 mm: caben 2 columnas × 5 filas = 10 por hoja
// (sin girar caben 9). Márgenes 19,4 mm (lados) y 13,5 mm (arriba y abajo).
export const COLUMNAS = 2;
export const FILAS = 5;
export const POR_HOJA = COLUMNAS * FILAS;

export function huecosA4(): Rect[] {
  const w = CR80.alto, h = CR80.ancho;
  const mx = (A4.ancho - COLUMNAS * w) / 2;
  const my = (A4.alto - FILAS * h) / 2;
  const huecos: Rect[] = [];
  for (let f = 0; f < FILAS; f++) for (let c = 0; c < COLUMNAS; c++) huecos.push({ x: mx + c * w, y: my + f * h, w, h });
  return huecos;
}
