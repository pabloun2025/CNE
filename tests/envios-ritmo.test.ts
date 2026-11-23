import { describe, expect, it } from "vitest";
import { pausaWhatsAppMs } from "@/domain/envios-ritmo";

describe("cadencia de WhatsApp", () => {
  it("oscila entre 90 y 150 segundos", () => {
    expect(pausaWhatsAppMs(() => 0)).toBe(90000);
    expect(pausaWhatsAppMs(() => 0.5)).toBe(120000);
    expect(pausaWhatsAppMs(() => 0.999999)).toBe(150000);
  });
});
