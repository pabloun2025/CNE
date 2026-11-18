import { describe, expect, it } from "vitest";
import { dentroDeHorario, horaEnMadrid, pausaAlAzarMs, PAUSA_SEGUNDOS, TOPE_DIARIO } from "@/domain/envios-ritmo";

describe("ritmo del envío real", () => {
  it("pausa al azar dentro del rango: WhatsApp 20–45 s, correo 2–5 s", () => {
    expect(pausaAlAzarMs("whatsapp", () => 0)).toBe(20_000);
    expect(pausaAlAzarMs("whatsapp", () => 0.999999)).toBeLessThanOrEqual(45_000);
    expect(pausaAlAzarMs("whatsapp", () => 0.5)).toBe(32_500);
    expect(pausaAlAzarMs("correo", () => 0)).toBe(2_000);
    for (let i = 0; i < 200; i++) {
      const w = pausaAlAzarMs("whatsapp", Math.random);
      expect(w).toBeGreaterThanOrEqual(PAUSA_SEGUNDOS.whatsapp.min * 1000);
      expect(w).toBeLessThanOrEqual(PAUSA_SEGUNDOS.whatsapp.max * 1000);
    }
  });
  it("horario de 9:00 a 21:00 de Madrid, todos los días (verano e invierno)", () => {
    // Invierno (UTC+1): 08:59 fuera, 09:00 dentro, 20:59 dentro, 21:00 fuera.
    expect(dentroDeHorario(new Date("2026-11-21T07:59:00Z"))).toBe(false);
    expect(dentroDeHorario(new Date("2026-11-21T08:00:00Z"))).toBe(true);
    expect(dentroDeHorario(new Date("2026-11-21T19:59:00Z"))).toBe(true); // sábado
    expect(dentroDeHorario(new Date("2026-11-21T20:00:00Z"))).toBe(false);
    expect(dentroDeHorario(new Date("2026-11-22T12:00:00Z"))).toBe(true); // domingo
    // Verano (UTC+2).
    expect(horaEnMadrid(new Date("2026-07-01T07:00:00Z"))).toBe(9);
    expect(dentroDeHorario(new Date("2026-07-01T06:59:00Z"))).toBe(false);
  });
  it("topes diarios del diseño", () => {
    expect(TOPE_DIARIO).toEqual({ whatsapp: 150, correo: 200 });
  });
});
