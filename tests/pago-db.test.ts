import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { guardarParametros, leerParametros } from "@/server/pago";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const sesion: Sesion = { sesionId: "x", usuarioId: 1, correo: "super@prueba.cne", nombre: "Super", tipo: "superadmin", rol: "consul", debeCambiar: false };

describe("parámetros de pago en la base", () => {
  beforeAll(() => reiniciarBase());
  afterAll(closePools);

  it("nacen todos vacíos", async () => {
    expect(Object.values(await leerParametros()).every((v) => v === null)).toBe(true);
  });
  it("actualiza el firmante y mantiene los importes históricos", async () => {
    await consultarDueno("UPDATE cne.parametros_pago SET importe_usd = 127.20, importe_eur = 55, lugar = 'LUGAR PRUEBA'");
    const e = { importe_usd: "100", importe_eur: "90", pagador_nombre: "PAGADOR PRUEBA", pagador_cargo: "CARGO PRUEBA", lugar: "OTRO LUGAR PRUEBA" };
    expect(await guardarParametros(sesion, e)).toEqual({ ok: true });
    expect(await leerParametros()).toEqual({ importe_usd: "127.20", importe_eur: "55.00", pagador_nombre: "PAGADOR PRUEBA", pagador_cargo: "CARGO PRUEBA", lugar: "LUGAR PRUEBA" });
    expect(await consultarDueno("SELECT portal FROM cne.auditoria WHERE accion = 'parametros_pago_guardados'")).toEqual([{ portal: "superadmin" }]);
    expect((await guardarParametros(sesion, { pagador_nombre: "x".repeat(121), pagador_cargo: "" })).ok).toBe(false);
    expect(await leerParametros()).toMatchObject({ pagador_nombre: "PAGADOR PRUEBA", pagador_cargo: "CARGO PRUEBA" });
  });
});
