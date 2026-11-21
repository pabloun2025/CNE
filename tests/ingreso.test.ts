import { describe, expect, it } from "vitest";
import { etiquetaCargoCredencial } from "@/domain/cargos-credencial";
import { opcionesJuntas, resolverCargo, validarCedula, validarCorreo, validarMovil } from "@/domain/ingreso";

describe("ingreso de ficha", () => {
  it("el cargo sale del desplegable y un texto libre no cuela", () => {
    expect(resolverCargo("presidente")).toEqual({ rol: "presidente", etiqueta: "PRESIDENTE/A" });
    expect(resolverCargo("SECRETARIO/A")).toEqual({ rol: "secretario", etiqueta: "SECRETARIO/A" });
    expect(resolverCargo("vocal")).toEqual({ rol: "vocal", etiqueta: "2do. VOCAL PRINCIPAL" });
    expect(resolverCargo("suplente")).toEqual({ rol: "suplente", etiqueta: "2do. VOCAL SUPLENTE" });
    expect(resolverCargo("otro")).toBeNull();
    expect(resolverCargo("jefe")).toBeNull();
    expect(resolverCargo("jefe suplente")).toBeNull();
  });

  it("presenta los aliases de los cuatro cargos y conserva otros cargos explícitos del padrón", () => {
    expect(["Presidenta", "Secretaria", "Vocal 2", "Vocal suplente", "Delegado", "1er. VOCAL PRINCIPAL", "3er. VOCAL SUPLENTE"].map(etiquetaCargoCredencial))
      .toEqual(["PRESIDENTE/A", "SECRETARIO/A", "2do. VOCAL PRINCIPAL", "2do. VOCAL SUPLENTE", "Delegado", "1er. VOCAL PRINCIPAL", "3er. VOCAL SUPLENTE"]);
  });

  it("ofrece a cada serie solamente sus números de junta", () => {
    expect(opcionesJuntas("H")).toEqual(Array.from({ length: 41 }, (_, i) => i + 1));
    expect(opcionesJuntas("M")).toEqual(Array.from({ length: 54 }, (_, i) => i + 1));
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
