import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools } from "@/server/db";
import { marcarGeneradas, resumenCredenciales, seleccionarParaCredencial } from "@/server/credenciales";
import { estadoEntregasCredenciales } from "@/server/envios-estado";
import { resumenAdmin } from "@/server/resumen-admin";
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
    await consultarDueno(`INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, incorporado_en)
      SELECT '0000000005', 'APELLIDO PRUEBA', 'INCORPORADO', 'VOCAL', 'vocal', id, now() FROM cne.juntas_madrid WHERE serie='H' AND numero=1`);
  });
  afterAll(closePools);

  it("muestra siempre la letra pública (M/F) aunque el rótulo importado traiga otra, usa la junta si falta y excluye las bajas y las incorporaciones de votantes", async () => {
    const r = await seleccionarParaCredencial({ alcance: "todas" });
    expect(r.total).toBe(3);
    expect(r.datos.map(({ cedula, rotulo, zona, cargo }) => ({ cedula, rotulo, zona, cargo }))).toEqual([
      { cedula: "0000000001", rotulo: "M1", zona: "amarillo", cargo: "2do. VOCAL PRINCIPAL" },
      { cedula: "0000000002", rotulo: "M1", zona: "amarillo", cargo: "2do. VOCAL PRINCIPAL" },
      { cedula: "0000000003", rotulo: "F9", zona: "celeste", cargo: "2do. VOCAL PRINCIPAL" },
    ]);
    expect(r.datos.every((d) => d.prueba)).toBe(true); // modo prueba
  });

  it("filtra por junta y por zona (celeste = M9–M29)", async () => {
    // «M5» es masculino y «F5» femenino; «H» se acepta como masculino por compatibilidad.
    expect((await seleccionarParaCredencial({ alcance: "junta", valor: "M1" })).total).toBe(2);
    expect((await seleccionarParaCredencial({ alcance: "junta", valor: "H1" })).total).toBe(2);
    expect((await seleccionarParaCredencial({ alcance: "junta", valor: "F1" })).total).toBe(0);
    expect((await seleccionarParaCredencial({ alcance: "junta", valor: "F9" })).datos.map((d) => d.cedula)).toEqual(["0000000003"]);
    expect((await seleccionarParaCredencial({ alcance: "junta", valor: "M9" })).total).toBe(0);
    expect((await seleccionarParaCredencial({ alcance: "zona", valor: "celeste" })).datos.map((d) => d.serie)).toEqual(["M"]);
    expect((await seleccionarParaCredencial({ alcance: "junta", valor: "M99" })).total).toBe(0);
  });

  it("el seguimiento y el panel solo muestran como pendientes las fichas que pueden tener credencial", async () => {
    const elegibles = await seleccionarParaCredencial({ alcance: "todas" });
    expect.soft((await estadoEntregasCredenciales()).map(({ id }) => id)).toEqual(elegibles.ids);
    expect((await resumenAdmin()).apertura).toMatchObject({ preparadas: 0, pendientes: 3 });
  });

  it("marca las generadas y «sin generar» las deja fuera", async () => {
    const r = await seleccionarParaCredencial({ alcance: "todas" });
    await marcarGeneradas(r.ids);
    expect((await seleccionarParaCredencial({ alcance: "sin_generar" })).total).toBe(0);
    expect(await resumenCredenciales()).toEqual({ activos: 3, preparadas: 3, pendientes: 0 });
  });
});
