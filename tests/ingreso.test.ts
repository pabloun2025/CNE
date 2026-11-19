import { describe, expect, it } from "vitest";
import { opcionesJuntas, resolverCargo, validarCedula, validarCorreo, validarMovil } from "@/domain/ingreso";

describe("ingreso de ficha", () => {
  it("el cargo sale del desplegable y un texto libre no cuela", () => {
    expect(resolverCargo("presidente")).toEqual({ rol: "presidente", etiqueta: "Presidente" });
    expect(resolverCargo("Presidente")?.rol).toBe("presidente");
    expect(resolverCargo("otro")).toEqual({ rol: "otro", etiqueta: "Otro" });
    expect(resolverCargo("jefe")).toBeNull();
  });

  it("la junta es una de las que ya existen", () => {
    const valores = opcionesJuntas().map((j) => j.valor);
    expect(valores).toContain("H1");
    expect(valores).toContain("H41");
    expect(valores).toContain("M1");
    expect(valores).toContain("M54");
    expect(valores).toHaveLength(95);
    expect(valores).not.toContain("H42");
  });

  it("la cédula respeta el largo ya válido", () => {
    expect(validarCedula("ABCDE").ok).toBe(true);
    expect(validarCedula("ab").ok).toBe(false);
    expect(validarCedula("A".repeat(21)).ok).toBe(false);
  });

  it("el móvil nace en +34 y rechaza un fijo", () => {
    expect(validarMovil("+34")).toEqual({ ok: true, telefono: null });
    expect(validarMovil("")).toEqual({ ok: true, telefono: null });
    expect(validarMovil("+34612345678")).toEqual({ ok: true, telefono: "+34612345678" });
    expect(validarMovil("+34911234567").ok).toBe(false);
    expect(validarMovil("123").ok).toBe(false);
  });

  it("el correo se comprueba antes de guardar", () => {
    expect(validarCorreo("")).toEqual({ ok: true, correo: null });
    expect(validarCorreo("a@b.c")).toEqual({ ok: true, correo: "a@b.c" });
    expect(validarCorreo("no-es").ok).toBe(false);
  });
});
