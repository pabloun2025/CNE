import { describe, expect, it } from "vitest";
import { A4, CR80, POR_HOJA, huecosA4 } from "@/domain/credencial-layout";

describe("hoja A4 de credenciales", () => {
  const huecos = huecosA4();
  it("hay 10 huecos de 85,6 × 54 mm dentro de 210 × 297 mm", () => {
    expect(huecos).toHaveLength(POR_HOJA);
    for (const h of huecos) {
      expect(h.w).toBeCloseTo(CR80.alto);
      expect(h.h).toBeCloseTo(CR80.ancho);
      expect(h.x).toBeGreaterThanOrEqual(0);
      expect(h.y).toBeGreaterThanOrEqual(0);
      expect(h.x + h.w).toBeLessThanOrEqual(A4.ancho + 1e-9);
      expect(h.y + h.h).toBeLessThanOrEqual(A4.alto + 1e-9);
    }
  });
  it("márgenes 19,4 mm y 13,5 mm", () => {
    expect(huecos[0].x).toBeCloseTo(19.4);
    expect(huecos[0].y).toBeCloseTo(13.5);
  });
  it("no se solapan", () => {
    for (let i = 0; i < huecos.length; i++) for (let j = i + 1; j < huecos.length; j++) {
      const a = huecos[i], b = huecos[j];
      const solapa = a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
      expect(solapa).toBe(false);
    }
  });
});
