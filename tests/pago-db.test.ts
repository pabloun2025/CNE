import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { guardarParametros, leerParametros } from "@/server/pago";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const sesion: Sesion = { sesionId: "x", usuarioId: 1, correo: "a@x.y", nombre: "Admin", tipo: "madrid_admin", debeCambiar: false, mfaVerificada: false };

describe("parámetros de pago en la base", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash) VALUES ('madrid_admin','a@x.y','A','x')");
  });
  afterAll(closePools);

  it("nacen todos vacíos", async () => {
    expect(Object.values(await leerParametros()).every((v) => v === null)).toBe(true);
  });
  it("guardan y se leen con decimales exactos; un valor inválido no escribe", async () => {
    const e = { importe_eur: "60", pagador_nombre: "PAGADOR PRUEBA", pagador_cargo: "CARGO PRUEBA", lugar: "LUGAR PRUEBA" };
    expect(await guardarParametros(sesion, e)).toEqual({ ok: true });
    expect(await leerParametros()).toMatchObject({ importe_eur: "60.00" });
    expect((await guardarParametros(sesion, { ...e, importe_eur: "-5" })).ok).toBe(false);
    expect((await leerParametros()).importe_eur).toBe("60.00");
  });
});
