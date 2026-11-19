import { describe, expect, it } from "vitest";
import { COLOR_LECTURA, tonoLectura } from "@/domain/puerta-aviso";

describe("colores de la lectura en puerta", () => {
  it("válida es verde", () => {
    expect(tonoLectura("valido")).toBe("valido");
    expect(COLOR_LECTURA.valido).toContain("#1f7a4d");
  });

  it("revocada, usada, desconocida o de baja es rojo y no entra como válida", () => {
    for (const resultado of ["revocado", "duplicado", "desconocido", "bloqueado"]) {
      expect(tonoLectura(resultado)).toBe("rechazo");
    }
    expect(COLOR_LECTURA.rechazo).toContain("#c8102e");
    expect(COLOR_LECTURA.rechazo).not.toContain("#1f7a4d");
  });

  it("un fallo de red o un nombre ambiguo no se pintan de rojo", () => {
    expect(tonoLectura("error")).toBe("aviso");
    expect(tonoLectura("ambiguo")).toBe("aviso");
    expect(COLOR_LECTURA.aviso).not.toContain("#c8102e");
  });
});
