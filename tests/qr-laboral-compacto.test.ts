import { expect, it } from "vitest";
import ejemplo from "./fixtures/justificante-ficticio.json";
it("recupera el mismo sobre firmado desde el QR compacto", async () => {
  const { compactarQr, normalizarTokenQr } = await import("@/server/justificante/compacto.cjs");
  const compacto = compactarQr(ejemplo.token);
  expect(normalizarTokenQr(compacto)).toBe(ejemplo.token);
  expect(normalizarTokenQr(ejemplo.token)).toBe(ejemplo.token);
  expect(() => normalizarTokenQr(compacto + "!")).toThrow();
});
