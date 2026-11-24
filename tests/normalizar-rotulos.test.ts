import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rotuloPublico } from "@/domain/juntas";
import { closePools } from "@/server/db";
import { seleccionarParaCredencial } from "@/server/credenciales";
import { normalizarRotulos } from "@/server/normalizar-rotulos";
import { consultarDueno, reiniciarBase } from "./helpers/db";

describe("rótulo guardado con la letra antigua", () => {
  beforeAll(async () => {
    await reiniciarBase();
    const j = "(SELECT id FROM cne.juntas_madrid WHERE serie = $1 AND numero = $2)";
    // Como en producción: la ficha de hombres guarda «H12» y la de mujeres «M5».
    for (const [i, serie, num, rotulo] of [[1, "H", 12, "H12"], [2, "M", 5, "M5"], [3, "H", 13, "Mesa especial"]] as const) {
      await consultarDueno(
        `INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, rotulo_credencial) VALUES ($3, 'APELLIDO PRUEBA 00' || $3, 'NOMBRE PRUEBA', 'VOCAL', 'vocal', ${j}, $4)`,
        [serie, num, String(i).padStart(10, "0"), rotulo]);
    }
  });
  afterAll(closePools);

  it("la salida lleva siempre la letra pública de la junta asignada", async () => {
    expect(rotuloPublico("H12", "M12")).toBe("M12");
    expect(rotuloPublico("M5", "F5")).toBe("F5");
    const r = await seleccionarParaCredencial({ alcance: "todas" });
    const porCedula = Object.fromEntries(r.datos.map((d) => [d.cedula, d.rotulo]));
    expect(porCedula).toEqual({ "0000000001": "M12", "0000000002": "F5", "0000000003": "M13" });
  });

  it("el script comprueba sin escribir y aplica la letra pública", async () => {
    expect(await normalizarRotulos(false)).toMatchObject({ fichas: 3, cambian: 2, textoLibre: 1, aplicada: false });
    expect((await consultarDueno<{ r: string }>("SELECT rotulo_credencial r FROM cne.mjrv ORDER BY id")).map((x) => x.r)).toEqual(["H12", "M5", "Mesa especial"]);
    expect(await normalizarRotulos(true)).toMatchObject({ cambian: 2, aplicada: true });
    expect((await consultarDueno<{ r: string }>("SELECT rotulo_credencial r FROM cne.mjrv ORDER BY id")).map((x) => x.r)).toEqual(["M12", "F5", "Mesa especial"]);
    expect(await normalizarRotulos(false)).toMatchObject({ cambian: 0, yaCorrectas: 2 });
  });
});
