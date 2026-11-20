import { describe, expect, it } from "vitest";
import { A4, CR80, planchaA4, leerMedidasCredencial } from "@/domain/credencial-layout";

describe("hoja A4 de credenciales", () => {
  const { papel, huecos } = planchaA4();
  it("caben 11 credenciales CR80 completas en una hoja A4 horizontal", () => {
    expect(huecos).toHaveLength(11);
    expect(papel).toEqual({ ancho: A4.alto, alto: A4.ancho });
    for (const h of huecos) {
      expect([h.w, h.h]).toEqual(h.giro === 90 ? [CR80.alto, CR80.ancho] : [CR80.ancho, CR80.alto]);
      expect(h.x).toBeGreaterThanOrEqual(5);
      expect(h.y).toBeGreaterThanOrEqual(5);
      expect(h.x + h.w).toBeLessThanOrEqual(papel.ancho - 5);
      expect(h.y + h.h).toBeLessThanOrEqual(papel.alto - 5);
    }
  });
  it("centra las filas y el bloque completo", () => {
    expect(huecos[0].x).toBeCloseTo(20.1);
    expect(huecos[6].x).toBeCloseTo(13.5);
    expect(huecos[0].y).toBeCloseTo(8.2);
  });
  it("no se solapan", () => {
    for (let i = 0; i < huecos.length; i++) for (let j = i + 1; j < huecos.length; j++) {
      const a = huecos[i], b = huecos[j];
      const solapa = a.x < b.x + b.w - 1e-9 && b.x < a.x + a.w - 1e-9 && a.y < b.y + b.h - 1e-9 && b.y < a.y + a.h - 1e-9;
      expect(solapa).toBe(false);
    }
  });

  it("combina orientaciones cuando caben más piezas completas a tamaño real", () => {
    const { papel, huecos } = planchaA4({ ancho: 55, alto: 70 });
    expect(huecos).toHaveLength(14);
    expect(new Set(huecos.map(({ giro }) => giro))).toEqual(new Set([0, 90]));
    for (const { x, y, w, h, giro } of huecos) {
      expect([w, h]).toEqual(giro === 90 ? [70, 55] : [55, 70]);
      expect(x).toBeGreaterThanOrEqual(5);
      expect(y).toBeGreaterThanOrEqual(5);
      expect(x + w).toBeLessThanOrEqual(papel.ancho - 5);
      expect(y + h).toBeLessThanOrEqual(papel.alto - 5);
    }
  });

  it("acepta medidas decimales y rechaza una pieza que no cabe en A4 en ningún sentido", () => {
    expect(leerMedidasCredencial("68,5", "93.25")).toEqual({ ancho: 68.5, alto: 93.25 });
    expect(leerMedidasCredencial("250", "80")).toEqual({ ancho: 250, alto: 80 });
    expect(leerMedidasCredencial("201", "201")).toBeNull();
    expect(leerMedidasCredencial("0", "54")).toBeNull();
    expect(leerMedidasCredencial("1e1", "85.6")).toBeNull();
  });
});
