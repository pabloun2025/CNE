import { describe, expect, it } from "vitest";
import { PARAMETROS_VACIOS, eurosEnLetras, faltanParametros, montosParaActa, validarParametros, type ParametrosPago } from "@/domain/pago";

// Valores evidentemente ficticios de prueba: ninguno es un importe real.
const base: ParametrosPago = { importe_usd: "127.25", importe_eur: "55.00", pagador_nombre: "PAGADOR PRUEBA", pagador_cargo: "CARGO PRUEBA", lugar: "LUGAR PRUEBA" };
const montos = (o: Partial<ParametrosPago>) => montosParaActa({ ...base, ...o });

describe("importe fijo en euros", () => {
  it("devuelve el importe en euros tal como se escribió", () => {
    expect(montos({})).toEqual({ estado: "ok", usd: "127.25", eur: "55.00" });
    expect(montos({ importe_eur: "55,5" })).toEqual({ estado: "ok", usd: "127.25", eur: "55.50" });
    expect(montos({})).not.toHaveProperty("tipoCambio");
  });
  it("permite emitir en EUR cuando el valor de referencia quedó vacío", () => {
    expect(montos({ importe_usd: null })).toEqual({ estado: "ok", usd: null, eur: "55.00" });
  });
  it("sin importe en euros o con un valor no válido → pendiente, sin cifra", () => {
    expect(montosParaActa(PARAMETROS_VACIOS)).toMatchObject({ estado: "pendiente" });
    for (const v of [null, " ", "0", "-1", "10.123", "abc"]) expect(montos({ importe_eur: v }).estado).toBe("pendiente");
  });
  it("para el acta hacen falta el importe en euros y el nombre de quien firma", () => {
    expect(faltanParametros(base)).toEqual([]);
    expect(faltanParametros({ ...base, pagador_nombre: null, lugar: " " })).toEqual(["nombre del funcionario que firma"]);
    expect(faltanParametros(PARAMETROS_VACIOS)).toEqual(["monto en euros", "nombre del funcionario que firma"]);
  });
});

describe("euro escrito en palabras", () => {
  it("lee la cifra ya guardada, sin convertir", () => {
    expect(eurosEnLetras("55.00")).toBe("cincuenta y cinco euros");
    expect(eurosEnLetras("1.00")).toBe("un euro");
    expect(eurosEnLetras("1.01")).toBe("un euro con un céntimo");
    expect(eurosEnLetras("21.50")).toBe("veintiún euros con cincuenta céntimos");
    expect(eurosEnLetras("100.00")).toBe("cien euros");
    expect(eurosEnLetras("101.00")).toBe("ciento un euros");
    expect(eurosEnLetras("1000.00")).toBe("mil euros");
  });
});

describe("validación del formulario", () => {
  const vacio = { importe_usd: "", importe_eur: "", pagador_nombre: "", pagador_cargo: "", lugar: "" };
  it("todo vacío es válido y queda en null (nada se propone)", () => {
    expect(validarParametros(vacio)).toEqual({ ok: true, valores: PARAMETROS_VACIOS });
  });
  it("rechaza 0, negativos, decimales de más y texto", () => {
    for (const v of ["0", "-1", "10.123", "abc", "1,2.3", "10000000000"]) {
      expect(validarParametros({ ...vacio, importe_eur: v }).ok).toBe(false);
      expect(validarParametros({ ...vacio, importe_usd: v }).ok).toBe(false);
    }
  });
  it("guarda ambos importes independientemente", () => {
    expect(validarParametros({ ...vacio, importe_usd: "127,2", importe_eur: "55" }))
      .toMatchObject({ ok: true, valores: { importe_usd: "127.20", importe_eur: "55.00" } });
  });
});
