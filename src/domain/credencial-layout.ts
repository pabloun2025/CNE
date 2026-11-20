// Medidas en milímetros desde el borde superior izquierdo.
export const MM = 72 / 25.4;
export type MedidasCredencial = { ancho: number; alto: number };
export const CR80 = { ancho: 54, alto: 85.6 } as const;
export const A4 = { ancho: 210, alto: 297 } as const;
const MARGEN = 5;
const ANCHO_UTIL = A4.ancho - 2 * MARGEN;
const ALTO_UTIL = A4.alto - 2 * MARGEN;

type Hueco = { x: number; y: number; w: number; h: number; giro: 0 | 90 };

export function leerMedidasCredencial(ancho: string, alto: string): MedidasCredencial | null {
  const mm = (s: string) => /^\d{1,3}(?:[.,]\d{1,2})?$/.test(s.trim()) ? Number(s.replace(",", ".")) : NaN;
  const w = mm(ancho), h = mm(alto);
  if (!(Math.min(w, h) >= 1 && Math.min(w, h) <= ANCHO_UTIL && Math.max(w, h) <= ALTO_UTIL)) return null;
  return { ancho: w, alto: h };
}

const caben = (disponible: number, pieza: number) => Math.floor((disponible + 1e-9) / pieza);

type Filas = { papel: MedidasCredencial; rectas: number; giradas: number; colsRectas: number; colsGiradas: number; total: number };

function mejoresFilas(papel: MedidasCredencial, { ancho, alto }: MedidasCredencial): Filas {
  const anchoUtil = papel.ancho - 2 * MARGEN;
  const altoUtil = papel.alto - 2 * MARGEN;
  const colsRectas = caben(anchoUtil, ancho), colsGiradas = caben(anchoUtil, alto);
  const maxGiradas = colsGiradas ? caben(altoUtil, ancho) : 0;
  let mejor: Filas = { papel, rectas: 0, giradas: 0, colsRectas, colsGiradas, total: 0 };
  for (let giradas = maxGiradas; giradas >= 0; giradas--) {
    const rectas = colsRectas ? caben(altoUtil - giradas * ancho, alto) : 0;
    const total = rectas * colsRectas + giradas * colsGiradas;
    if (total > mejor.total) mejor = { papel, rectas, giradas, colsRectas, colsGiradas, total };
  }
  return mejor;
}

export function planchaA4(medidas: MedidasCredencial = CR80): { papel: MedidasCredencial; huecos: Hueco[] } {
  const vertical = mejoresFilas(A4, medidas);
  const horizontal = mejoresFilas({ ancho: A4.alto, alto: A4.ancho }, medidas);
  const { papel, rectas, giradas, colsRectas, colsGiradas } = horizontal.total > vertical.total ? horizontal : vertical;
  const { ancho, alto } = medidas;
  const huecos: Hueco[] = [];
  let y = (papel.alto - rectas * alto - giradas * ancho) / 2;
  for (const [filas, columnas, w, h, giro] of [[giradas, colsGiradas, alto, ancho, 90], [rectas, colsRectas, ancho, alto, 0]] as const) {
    const x = (papel.ancho - columnas * w) / 2;
    for (let f = 0; f < filas; f++, y += h) {
      for (let c = 0; c < columnas; c++) huecos.push({ x: x + c * w, y, w, h, giro });
    }
  }
  return { papel, huecos };
}
