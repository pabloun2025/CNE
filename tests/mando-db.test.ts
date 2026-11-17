import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { cargarDemo } from "@/server/demo";
import type { SesionEstacion } from "@/server/estaciones";
import { detalleJunta, estadoMando } from "@/server/mando";
import { registrarLectura } from "@/server/puerta";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const sup: Sesion = { sesionId: "x", usuarioId: 1, correo: "s@x.y", nombre: "S", tipo: "superadmin", debeCambiar: false, mfaVerificada: true };

describe("centro de mando con la demostración", () => {
  let est: SesionEstacion;
  beforeAll(async () => {
    await reiniciarBase();
    await cargarDemo(sup);
    await consultarDueno("INSERT INTO cne.operadores_madrid (nombre, pin_hash, funciones) VALUES ('Op Prueba','x','{puerta}')");
    await consultarDueno("INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('puerta','Puerta 1','\\x01')");
    const [o] = await consultarDueno<{ id: number }>("SELECT id FROM cne.operadores_madrid");
    const [e] = await consultarDueno<{ id: number }>("SELECT id FROM cne.enlaces_estacion");
    est = { sesionId: "x", funcion: "puerta", operadorId: o.id, operadorNombre: "Op", enlaceId: e.id, etiqueta: "P1" };
  });
  afterAll(closePools);

  it("sin lecturas todas las juntas están en rojo; con 1 lectura H12 es ámbar y con 3 verde", async () => {
    let m = await estadoMando();
    expect(m.juntas).toHaveLength(95);
    expect(m.indicadores).toMatchObject({ ingresados: 0, total: 570, sinNadie: 95 });
    await registrarLectura(est, "0000000067", null);
    const h12 = async () => (await estadoMando()).juntas.find((j) => j.serie === "H" && j.numero === 12)!;
    expect(await h12()).toMatchObject({ presentes: 1, estado: "faltan", texto: "Faltan 2", zona: "amarillo" });
    await registrarLectura(est, "0000000068", null);
    await registrarLectura(est, "0000000069", null);
    expect(await h12()).toMatchObject({ presentes: 3, estado: "completa" });
    m = await estadoMando();
    expect(m.indicadores).toMatchObject({ ingresados: 3, completas: 1, sinNadie: 94 });
  });

  it("la ficha de junta lista los miembros y su situación", async () => {
    const [j] = await consultarDueno<{ id: number }>("SELECT id FROM cne.juntas_madrid WHERE serie='H' AND numero=12");
    const d = await detalleJunta(j.id);
    expect(d?.junta.etiqueta).toBe("H12");
    expect(d?.miembros).toHaveLength(6);
    expect(d?.miembros.filter((x) => x.ingresado)).toHaveLength(3);
  });
});
