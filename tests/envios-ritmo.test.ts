import { describe, expect, it } from "vitest";
import { pausaWhatsAppMs } from "@/domain/envios-ritmo";

describe("cadencia de WhatsApp", () => {
  it("oscila entre 20 y 45 segundos", () => {
    expect(pausaWhatsAppMs(() => 0)).toBe(20000);
    expect(pausaWhatsAppMs(() => 0.5)).toBe(32500);
    expect(pausaWhatsAppMs(() => 0.99999)).toBe(45000);
  });
});
