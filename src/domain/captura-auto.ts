// Captura automática de la cédula (§7.4, M23): decide cuándo la imagen está quieta y nítida. Puro: sin cámara ni canvas.

// Umbrales sobre una miniatura en grises de ~320 px de ancho. Son punto de partida: se calibran con los móviles reales (08, sección D).
export const MIN_NITIDEZ = 120; // varianza del laplaciano: por debajo la imagen está borrosa o vacía
export const MAX_MOVIMIENTO = 6; // diferencia media absoluta (0–255) entre fotogramas seguidos
export const MS_ESTABLE = 1000; // tiempo seguido cumpliendo ambas condiciones

// Varianza del laplaciano (4 vecinos) de una imagen en grises. Alta = bordes marcados = enfocada.
export function varianzaLaplaciano(g: ArrayLike<number>, ancho: number, alto: number): number {
  if (ancho < 3 || alto < 3) return 0;
  let suma = 0, suma2 = 0, n = 0;
  for (let y = 1; y < alto - 1; y++) {
    for (let x = 1; x < ancho - 1; x++) {
      const i = y * ancho + x;
      const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - ancho] - g[i + ancho];
      suma += l; suma2 += l * l; n++;
    }
  }
  const media = suma / n;
  return suma2 / n - media * media;
}

// Diferencia media absoluta entre dos fotogramas del mismo tamaño.
export function diferenciaMedia(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  if (n === 0) return 255;
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  return s / n;
}

// RGBA (ImageData) a grises con los pesos de luminancia habituales.
export function aGrises(rgba: ArrayLike<number>): Uint8ClampedArray {
  const g = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  return g;
}

export type Muestra = { t: number; nitidez: number; movimiento: number };

// Dispara una sola vez cuando las condiciones se mantienen MS_ESTABLE seguidos; cualquier fallo reinicia la cuenta.
export class DetectorCaptura {
  private desde: number | null = null;
  constructor(private readonly opciones = { minNitidez: MIN_NITIDEZ, maxMovimiento: MAX_MOVIMIENTO, ms: MS_ESTABLE }) {}

  evaluar(m: Muestra): { dispara: boolean; progreso: number } {
    const bien = m.nitidez >= this.opciones.minNitidez && m.movimiento <= this.opciones.maxMovimiento;
    if (!bien) { this.desde = null; return { dispara: false, progreso: 0 }; }
    this.desde ??= m.t;
    const progreso = Math.min(1, (m.t - this.desde) / this.opciones.ms);
    return { dispara: progreso >= 1, progreso };
  }

  reiniciar(): void { this.desde = null; }
}
