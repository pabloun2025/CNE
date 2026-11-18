import { describe, expect, it } from "vitest";
import { PARAMETROS_VACIOS, faltanParametros, montosParaActa, validarParametros, type ParametrosPago } from "@/domain/pago";

// Valores evidentemente ficticios de prueba: ninguno es un importe real.
const base: ParametrosPago = { importe_usd: "60.00", tipo_cambio: "0.92", pagador_nombre: "PAGADOR PRUEBA", pagador_cargo: "CARGO PRUEBA", lugar: "LUGAR PRUEBA" };
const montos = (o: Partial<ParametrosPago>) => montosParaActa({ ...base, ...o });

describe("monto en dólares y tipo de cambio escrito", () => {
  it("devuelve el monto y el tipo de cambio tal como se escribieron, sin convertir", () => {
    expect(montos({})).toEqual({ estado: "ok", usd: "60.00", tipoCambio: "0.92" });
    expect(montos({ importe_usd: "60", tipo_cambio: "0,920000" })).toEqual({ estado: "ok", usd: "60.00", tipoCambio: "0.92" });
    expect(montos({ importe_usd: "0.30", tipo_cambio: "1" })).toEqual({ estado: "ok", usd: "0.30", tipoCambio: "1" });
    // 60 × 0,92 no aparece: la fórmula sigue abierta.
    expect(montos({})).not.toHaveProperty("eur");
  });
  it("sin monto, sin tipo de cambio o con un valor no válido → pendiente, sin cifra", () => {
    expect(montosParaActa(PARAMETROS_VACIOS)).toMatchObject({ estado: "pendiente" });
    for (const v of [null, " ", "0", "-1", "10.123", "abc", "1,5"]) expect(montos({ importe_usd: v }).estado).toBe("pendiente");
    for (const v of [null, " ", "0", "-1", "1.1234567", "abc"]) expect(montos({ tipo_cambio: v }).estado).toBe("pendiente");
  });
  it("para el acta hacen falta el monto, el tipo de cambio y el nombre de quien paga", () => {
    expect(faltanParametros(base)).toEqual([]);
    expect(faltanParametros({ ...base, pagador_nombre: null, lugar: " " })).toEqual(["nombre de quien paga"]);
    expect(faltanParametros(PARAMETROS_VACIOS)).toEqual(["monto en dólares", "tipo de cambio del día", "nombre de quien paga"]);
  });
});

describe("validación del formulario", () => {
  const vacio = { importe_usd: "", tipo_cambio: "", pagador_nombre: "", pagador_cargo: "", lugar: "" };
  it("todo vacío es válido y queda en null (nada se propone)", () => {
    expect(validarParametros(vacio)).toEqual({ ok: true, valores: PARAMETROS_VACIOS });
  });
  it("rechaza 0, negativos, decimales de más y texto", () => {
    for (const v of ["0", "-1", "10.123", "abc", "1,5"]) expect(validarParametros({ ...vacio, importe_usd: v }).ok).toBe(false);
    for (const v of ["0", "-1", "1.1234567", "abc"]) expect(validarParametros({ ...vacio, tipo_cambio: v }).ok).toBe(false);
  });
  it("acepta un monto y un tipo de cambio válidos", () => {
    expect(validarParametros({ ...vacio, importe_usd: "60", tipo_cambio: "0,92" })).toMatchObject({ ok: true, valores: { importe_usd: "60.00", tipo_cambio: "0.92" } });
  });
});
