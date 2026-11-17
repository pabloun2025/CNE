import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools } from "@/server/db";
import { marcarGeneradas, resumenCredenciales, seleccionarParaCredencial } from "@/server/credenciales";
import { consultarDueno, reiniciarBase } from "./helpers/db";

describe("selección de credenciales", () => {
  beforeAll(async () => {
    await reiniciarBase();
    const j = "(SELECT id FROM cne.juntas_madrid WHERE serie = $1 AND numero = $2)";
    for (const [i, serie, num, rotulo, activo] of [[1, "H", 1, "H01", true], [2, "H", 1, null, true], [3, "M", 9, "M09", true], [4, "M", 9, "M09", false]] as const) {
      await consultarDueno(
        `INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, rotulo_credencial, activo) VALUES ($3, 'APELLIDO PRUEBA 00' || $3, 'NOMBRE PRUEBA', 'VOCAL', 'vocal', ${j}, $4, $5)`,
        [serie, num, String(i).padStart(10, "0"), rotulo, activo],
      );
    }
  });
  afterAll(closePools);

  it("excluye sin rótulo y de baja, y los cuenta para avisar", async () => {
    const r = await seleccionarParaCredencial({ alcance: "todas" });
    expect(r).toMatchObject({ total: 3, sinRotulo: 1 });
    expect(r.datos.map((d) => d.cedula)).toEqual(["0000000001", "0000000003"]);
    expect(r.datos.every((d) => d.prueba)).toBe(true); // modo prueba
  });

  it("filtra por junta y por zona (celeste = M9–M29)", async () => {
    expect((await seleccionarParaCredencial({ alcance: "junta", valor: "H1" })).total).toBe(2);
    expect((await seleccionarParaCredencial({ alcance: "zona", valor: "celeste" })).datos.map((d) => d.serie)).toEqual(["M"]);
    expect((await seleccionarParaCredencial({ alcance: "junta", valor: "H99" })).total).toBe(0);
  });

  it("marca las generadas y «sin generar» las deja fuera", async () => {
    const r = await seleccionarParaCredencial({ alcance: "todas" });
    await marcarGeneradas(r.ids);
    expect((await seleccionarParaCredencial({ alcance: "sin_generar" })).total).toBe(1);
    expect(await resumenCredenciales()).toEqual({ activos: 3, preparadas: 2, pendientes: 1, sinRotulo: 1 });
  });
});
