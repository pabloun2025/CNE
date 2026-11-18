import { describe, expect, it } from "vitest";
import { PARAMETROS_VACIOS, calcularImporteEur, faltanParametros, validarParametros, type ParametrosPago } from "@/domain/pago";

// Valores evidentemente ficticios de prueba: ninguno es un importe real.
const base: ParametrosPago = { importe_eur: "60.00", pagador_nombre: "PAGADOR PRUEBA", pagador_cargo: "CARGO PRUEBA", lugar: "LUGAR PRUEBA" };
const eur = (o: Partial<ParametrosPago>) => { const r = calcularImporteEur({ ...base, ...o }); return r.estado === "ok" ? r.texto : null; };

describe("importe fijo en EUR", () => {
  it("devuelve el importe aprobado con 2 decimales exactos", () => {
    expect(eur({})).toBe("60.00");
    expect(eur({ importe_eur: "60" })).toBe("60.00");
    expect(eur({ importe_eur: "0.30" })).toBe("0.30");
    expect(eur({ importe_eur: "99999999.99" })).toBe("99999999.99");
  });
  it("sin importe o con un valor no válido → pendiente, sin cifra", () => {
    expect(calcularImporteEur(PARAMETROS_VACIOS)).toMatchObject({ estado: "pendiente" });
    for (const v of [null, " ", "0", "-1", "10.123", "abc", "1,5"]) expect(eur({ importe_eur: v })).toBeNull();
  });
  it("para confirmar pagos hacen falta también pagador y lugar", () => {
    expect(faltanParametros(base)).toEqual([]);
    expect(faltanParametros({ ...base, pagador_nombre: null, lugar: " " })).toEqual(["nombre del pagador", "lugar"]);
    expect(faltanParametros(PARAMETROS_VACIOS)).toHaveLength(4);
  });
});

describe("validación del formulario", () => {
  const vacio = { importe_eur: "", pagador_nombre: "", pagador_cargo: "", lugar: "" };
  it("todo vacío es válido y queda en null (nada se propone)", () => {
    expect(validarParametros(vacio)).toEqual({ ok: true, valores: PARAMETROS_VACIOS });
  });
  it("rechaza 0, negativos, 3 decimales y texto", () => {
    for (const v of ["0", "-1", "10.123", "abc", "1,5"]) expect(validarParametros({ ...vacio, importe_eur: v }).ok).toBe(false);
  });
  it("acepta un importe válido", () => {
    expect(validarParametros({ ...vacio, importe_eur: "60" })).toMatchObject({ ok: true, valores: { importe_eur: "60" } });
  });
});
