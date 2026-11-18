import { describe, expect, it } from "vitest";
import { PARAMETROS_VACIOS, calcularImporteEur, faltanParametros, validarParametros, type ParametrosPago } from "@/domain/pago";

// Valores evidentemente ficticios de prueba: ninguno es un importe ni un cambio real.
const base: ParametrosPago = { importe_usd: "100.00", tipo_cambio: "1.000000", sentido_cambio: "eur_por_usd", decimales_eur: 2, redondeo: "mitad_arriba", pagador_nombre: "PAGADOR PRUEBA", pagador_cargo: "CARGO PRUEBA", lugar: "LUGAR PRUEBA" };
const eur = (o: Partial<ParametrosPago>) => { const r = calcularImporteEur({ ...base, ...o }); return r.estado === "ok" ? r.texto : null; };

describe("cálculo del importe en EUR", () => {
  it("100 USD con cambio 1 da 100.00", () => expect(eur({})).toBe("100.00"));

  it("EUR por USD: multiplica; redondeo mitad arriba o truncar, con 2 y 0 decimales", () => {
    expect(eur({ tipo_cambio: "0.925" })).toBe("92.50");
    expect(eur({ tipo_cambio: "0.923456" })).toBe("92.35");
    expect(eur({ tipo_cambio: "0.923456", redondeo: "truncar" })).toBe("92.34");
    expect(eur({ tipo_cambio: "0.925", decimales_eur: 0 })).toBe("93.00");
    expect(eur({ tipo_cambio: "0.925", decimales_eur: 0, redondeo: "truncar" })).toBe("92.00");
  });

  it("USD por EUR: divide; ambos redondeos y decimales", () => {
    const d = { sentido_cambio: "usd_por_eur" as const, tipo_cambio: "1.5" };
    expect(eur(d)).toBe("66.67");
    expect(eur({ ...d, redondeo: "truncar" })).toBe("66.66");
    expect(eur({ ...d, decimales_eur: 0 })).toBe("67.00");
    expect(eur({ ...d, decimales_eur: 0, redondeo: "truncar" })).toBe("66.00");
    expect(eur({ sentido_cambio: "usd_por_eur", tipo_cambio: "2" })).toBe("50.00");
  });

  it("sin errores de coma flotante (0.1 + 0.2 y cifras grandes)", () => {
    expect(eur({ importe_usd: "0.30", tipo_cambio: "1" })).toBe("0.30");
    expect(eur({ importe_usd: "10.10", tipo_cambio: "1.1" })).toBe("11.11");
    expect(eur({ importe_usd: "99999999.99", tipo_cambio: "1" })).toBe("99999999.99");
  });

  it("parámetros incompletos → pendiente, sin cifra", () => {
    expect(calcularImporteEur(PARAMETROS_VACIOS)).toMatchObject({ estado: "pendiente" });
    for (const campo of ["importe_usd", "tipo_cambio", "sentido_cambio", "decimales_eur", "redondeo"] as const) expect(eur({ [campo]: null })).toBeNull();
    expect(eur({ importe_usd: "0" })).toBeNull();
    expect(eur({ tipo_cambio: "abc" })).toBeNull();
  });

  it("para confirmar pagos hacen falta también pagador y lugar", () => {
    expect(faltanParametros(base)).toEqual([]);
    expect(faltanParametros({ ...base, pagador_nombre: null, lugar: " " })).toEqual(["nombre del pagador", "lugar"]);
    expect(faltanParametros(PARAMETROS_VACIOS)).toHaveLength(8);
  });
});

describe("validación del formulario", () => {
  const vacio = { importe_usd: "", tipo_cambio: "", sentido_cambio: "", decimales_eur: "", redondeo: "", pagador_nombre: "", pagador_cargo: "", lugar: "" };
  it("todo vacío es válido y queda en null (nada se propone)", () => {
    expect(validarParametros(vacio)).toEqual({ ok: true, valores: PARAMETROS_VACIOS });
  });
  it("rechaza importes, cambios y opciones incoherentes", () => {
    expect(validarParametros({ ...vacio, importe_usd: "-1" }).ok).toBe(false);
    expect(validarParametros({ ...vacio, importe_usd: "10.123" }).ok).toBe(false);
    expect(validarParametros({ ...vacio, tipo_cambio: "0" }).ok).toBe(false);
    expect(validarParametros({ ...vacio, decimales_eur: "1" }).ok).toBe(false);
    expect(validarParametros({ ...vacio, redondeo: "otro" }).ok).toBe(false);
    expect(validarParametros({ ...vacio, sentido_cambio: "x" }).ok).toBe(false);
  });
  it("acepta valores válidos", () => {
    const r = validarParametros({ ...vacio, importe_usd: "100", tipo_cambio: "1", sentido_cambio: "usd_por_eur", decimales_eur: "0", redondeo: "truncar" });
    expect(r).toMatchObject({ ok: true, valores: { importe_usd: "100", decimales_eur: 0, redondeo: "truncar" } });
  });
});
