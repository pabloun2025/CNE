import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { cargarDemo } from "@/server/demo";
import type { SesionEstacion } from "@/server/estaciones";
import { detalleJunta, estadoMando } from "@/server/mando";
import { asignarCargo, quitarCargo } from "@/server/movimientos";
import { registrarLectura } from "@/server/puerta";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const sup: Sesion = { sesionId: "x", usuarioId: 1, correo: "s@x.y", nombre: "S", tipo: "superadmin", rol: "consul", debeCambiar: false };

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
    expect(await h12()).toMatchObject({ presentes: 1, estado: "faltan", texto: "Falta gente", zona: "amarillo" });
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
    // Los tres cargos con quién los cubre y de qué manera.
    expect(d?.cargos.map((c) => [c.cargo, c.tipo, c.etiqueta])).toEqual([["presidente", "titular", "Titular"], ["secretario", "titular", "Titular"], ["vocal", "titular", "Titular"]]);
    expect(d?.sinCargo).toEqual([]);
  });
});

describe("D09 · cargos asignados a mano (contra la base)", () => {
  const actor = { tipo: "madrid_admin" as const, id: 1, nombre: "Admin Prueba" };
  let junta: number;
  const otros: number[] = [];
  beforeAll(async () => {
    await reiniciarBase();
    [{ id: junta }] = await consultarDueno<{ id: number }>("SELECT id FROM cne.juntas_madrid WHERE serie = 'H' AND numero = 5");
    for (let i = 0; i < 3; i++) {
      const [m] = await consultarDueno<{ id: number }>(
        "INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, incorporado_en, incorporado_por) VALUES ($1,'APELLIDO PRUEBA','NOMBRE PRUEBA','VOTANTE','otro',$2, now(), 'Prueba') RETURNING id",
        [`700000000${i}`, junta]);
      otros.push(m.id);
    }
  });
  afterAll(closePools);

  const cargos = async () => (await detalleJunta(junta))!.cargos.map((c) => [c.cargo, c.mjrvId, c.tipo]);

  it("las personas presentes sin cargo se asignan a un cargo vacante; se puede quitar", async () => {
    expect((await estadoMando()).juntas.find((j) => j.id === junta)).toMatchObject({ presentes: 3, estado: "completa", texto: "3 presentes" });
    expect(await asignarCargo(actor, { juntaId: junta, mjrvId: otros[0], cargo: "presidente" })).toEqual({ ok: true });
    expect(await cargos()).toEqual([["presidente", otros[0], "manual"], ["secretario", null, null], ["vocal", null, null]]);
    // Cargo ya cubierto o persona ajena a la junta: «la situación cambió».
    expect(await asignarCargo(actor, { juntaId: junta, mjrvId: otros[1], cargo: "presidente" })).toMatchObject({ ok: false, cambio: true });
    expect(await asignarCargo(actor, { juntaId: junta, mjrvId: 999999, cargo: "vocal" })).toMatchObject({ ok: false, cambio: true });
    expect(await asignarCargo(actor, { juntaId: junta, mjrvId: otros[1], cargo: "jefe" })).toMatchObject({ ok: false });
    // Una asignación nueva de la misma persona anula la anterior.
    expect(await asignarCargo(actor, { juntaId: junta, mjrvId: otros[0], cargo: "vocal" })).toEqual({ ok: true });
    expect(await cargos()).toEqual([["presidente", null, null], ["secretario", null, null], ["vocal", otros[0], "manual"]]);
    expect((await consultarDueno("SELECT 1 FROM cne.asignaciones_cargo WHERE activa")).length).toBe(1);
    expect(await quitarCargo(actor, { juntaId: junta, mjrvId: otros[0] })).toEqual({ ok: true });
    expect(await quitarCargo(actor, { juntaId: junta, mjrvId: otros[0] })).toMatchObject({ ok: false, cambio: true });
    expect((await consultarDueno<{ accion: string }>("SELECT accion FROM cne.auditoria WHERE accion LIKE 'cargo_%' ORDER BY id")).map((a) => a.accion)).toEqual(["cargo_asignado", "cargo_asignado", "cargo_quitado"]);
  });

  it("dos asignaciones simultáneas al mismo puesto: solo una prospera", async () => {
    const r = await Promise.all([
      asignarCargo(actor, { juntaId: junta, mjrvId: otros[1], cargo: "secretario" }),
      asignarCargo(actor, { juntaId: junta, mjrvId: otros[2], cargo: "secretario" }),
      asignarCargo(actor, { juntaId: junta, mjrvId: otros[0], cargo: "secretario" }),
    ]);
    expect(r.filter((x) => x.ok)).toHaveLength(1);
    expect((await consultarDueno("SELECT 1 FROM cne.asignaciones_cargo WHERE activa AND cargo = 'secretario'")).length).toBe(1);
  });
});
