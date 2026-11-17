import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prepararBase } from "@/server/schema-apply";
import { closePools } from "@/server/db";
import { TRAMOS, etiquetaJunta, leerJunta, zonaDe } from "@/domain/juntas";
import { consultarDueno, reiniciarBase } from "../helpers/db";

describe("db:prepare", () => {
  beforeAll(async () => {
    await reiniciarBase();
  });
  afterAll(closePools);

  it("dos ejecuciones seguidas no fallan ni duplican", async () => {
    const segunda = await prepararBase({ url: process.env.DATABASE_TEST_URL });
    expect(segunda.esquemaNuevo).toBe(false);
    expect(segunda.superadminCreada).toBe(false);
    expect(segunda.juntas).toBe(95);
    expect((await consultarDueno("SELECT 1 FROM cne.usuarios WHERE tipo = 'superadmin'")).length).toBe(1);
  });

  it("siembra 95 juntas: 41 H y 54 M con el color de la especificación", async () => {
    const porSerie = await consultarDueno<{ serie: string; n: number }>("SELECT serie, count(*)::int AS n FROM cne.juntas_madrid GROUP BY serie ORDER BY serie");
    expect(porSerie).toEqual([{ serie: "H", n: 41 }, { serie: "M", n: 54 }]);
    for (const tramo of TRAMOS) {
      const filas = await consultarDueno<{ n: number }>(
        "SELECT count(*)::int AS n FROM cne.juntas_madrid WHERE serie = $1 AND numero BETWEEN $2 AND $3 AND zona_color = $4",
        [tramo.serie, tramo.desde, tramo.hasta, tramo.zona],
      );
      expect(filas[0].n).toBe(tramo.hasta - tramo.desde + 1);
    }
  });

  it("orden de cercanía: celeste 1, rojo 2, azul 3, amarillo 4, verde 5, rosado 6", async () => {
    const filas = await consultarDueno<{ zona_color: string; orden: number }>("SELECT zona_color, min(orden_cercania)::int AS orden FROM cne.juntas_madrid GROUP BY zona_color");
    const mapa = Object.fromEntries(filas.map((f) => [f.zona_color, f.orden]));
    expect(mapa).toEqual({ celeste: 1, rojo: 2, azul: 3, amarillo: 4, verde: 5, rosado: 6 });
  });

  it("la superadmin queda con cambio de contraseña obligatorio y la base arranca en modo prueba", async () => {
    const [s] = await consultarDueno<{ debe_cambiar: boolean; correo: string }>("SELECT debe_cambiar, correo FROM cne.usuarios WHERE tipo = 'superadmin'");
    expect(s).toEqual({ debe_cambiar: true, correo: "super@prueba.cne" });
    expect((await consultarDueno<{ modo: string }>("SELECT modo FROM cne.configuracion"))[0].modo).toBe("prueba");
  });

  it("falla con mensaje claro si APP_MASTER_KEY no da 32 bytes", async () => {
    const original = process.env.APP_MASTER_KEY;
    process.env.APP_MASTER_KEY = Buffer.from("corta").toString("base64");
    try {
      await expect(prepararBase({ url: process.env.DATABASE_TEST_URL })).rejects.toThrow("APP_MASTER_KEY debe decodificar a 32 bytes");
    } finally {
      process.env.APP_MASTER_KEY = original;
    }
  });
});

describe("dominio de juntas", () => {
  it("etiquetas y lectura de juntas", () => {
    expect(etiquetaJunta("H", 12)).toBe("H12");
    expect(leerJunta("m07")).toEqual({ serie: "M", numero: 7 });
    expect(leerJunta("H42")).toBeNull();
    expect(leerJunta("M55")).toBeNull();
    expect(zonaDe("M", 30)).toBe("verde");
  });
});
