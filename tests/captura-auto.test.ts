import { describe, expect, it } from "vitest";
import { aGrises, DetectorCaptura, diferenciaMedia, MIN_NITIDEZ, varianzaLaplaciano } from "@/domain/captura-auto";

const W = 64, H = 40;
const plano = () => new Uint8ClampedArray(W * H).fill(128);
// Tablero de ajedrez de 2 px: bordes duros (nítido).
const tablero = () => Uint8ClampedArray.from({ length: W * H }, (_, i) => ((Math.floor((i % W) / 2) + Math.floor(Math.floor(i / W) / 2)) % 2 ? 230 : 20));
// El mismo tablero desenfocado con una media 5×5 (borroso).
function difuminar(g: Uint8ClampedArray) {
  const o = new Uint8ClampedArray(g.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < W && yy >= 0 && yy < H) { s += g[yy * W + xx]; n++; }
    }
    o[y * W + x] = s / n;
  }
  return o;
}

describe("nitidez y movimiento", () => {
  it("una imagen plana vale 0; la nítida supera el umbral; la borrosa queda por debajo", () => {
    expect(varianzaLaplaciano(plano(), W, H)).toBe(0);
    expect(varianzaLaplaciano(tablero(), W, H)).toBeGreaterThan(MIN_NITIDEZ);
    expect(varianzaLaplaciano(difuminar(tablero()), W, H)).toBeLessThan(varianzaLaplaciano(tablero(), W, H) / 10);
  });
  it("diferencia media entre fotogramas y conversión a grises", () => {
    expect(diferenciaMedia(plano(), plano())).toBe(0);
    expect(diferenciaMedia(new Uint8Array([0, 0]), new Uint8Array([10, 20]))).toBe(15);
    expect(Array.from(aGrises([255, 255, 255, 255, 0, 0, 0, 255]))).toEqual([255, 0]);
  });
});

describe("detector de captura automática", () => {
  const bien = (t: number) => ({ t, nitidez: 500, movimiento: 1 });
  it("dispara tras 1 s seguido y no antes", () => {
    const d = new DetectorCaptura();
    expect(d.evaluar(bien(0)).dispara).toBe(false);
    expect(d.evaluar(bien(500)).progreso).toBeCloseTo(0.5);
    expect(d.evaluar(bien(999)).dispara).toBe(false);
    expect(d.evaluar(bien(1000)).dispara).toBe(true);
  });
  it("movimiento o desenfoque reinician la cuenta", () => {
    const d = new DetectorCaptura();
    d.evaluar(bien(0));
    expect(d.evaluar({ t: 600, nitidez: 500, movimiento: 40 })).toEqual({ dispara: false, progreso: 0 });
    expect(d.evaluar(bien(700)).dispara).toBe(false);
    expect(d.evaluar(bien(1500)).dispara).toBe(false); // solo 800 ms desde el reinicio
    expect(d.evaluar({ t: 1600, nitidez: 10, movimiento: 1 }).progreso).toBe(0);
    d.evaluar(bien(1700));
    expect(d.evaluar(bien(2700)).dispara).toBe(true);
  });
});
