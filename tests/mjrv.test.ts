import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { cambiarBaja, crearMjrv, editarMjrv, listarMjrv, obtenerFicha, type DatosMjrv } from "@/server/mjrv";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const sesion: Sesion = { sesionId: "x", usuarioId: 1, correo: "a@x.y", nombre: "Admin", tipo: "madrid_admin", rol: "consul", debeCambiar: false };
const datos = (o: Partial<DatosMjrv> = {}): DatosMjrv => ({ cedula: "0000000001", apellidos: "APELLIDO PRUEBA 001", nombres: "NOMBRE PRUEBA", cargo: "presidente", junta: "H12", correo: "", telefono: "", ...o });

describe("fichas de MJRV", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash) VALUES ('madrid_admin','a@x.y','A','x')");
  });
  afterAll(closePools);

  it("crea una ficha con rol derivado y la cédula es única", async () => {
    const r = await crearMjrv(sesion, datos());
    expect(r.ok).toBe(true);
    const f = await obtenerFicha((r as { id: number }).id);
    expect(f).toMatchObject({ rol: "presidente", cargo_original: "PRESIDENTE/A", origen: "M12", vigente: "M12", activo: true, es_prueba: false, rotulo_credencial: null });
    expect(await crearMjrv(sesion, datos({ junta: "H13" }))).toEqual({ ok: false, mensaje: "Ya existe una ficha con esa cédula." });
  });

  it("rechaza junta inexistente, cédula inválida y datos vacíos", async () => {
    expect((await crearMjrv(sesion, datos({ cedula: "0000000002", junta: "H42" }))).ok).toBe(false);
    expect((await crearMjrv(sesion, datos({ cedula: "0000000002", junta: "F55" }))).ok).toBe(false);
    expect((await crearMjrv(sesion, datos({ cedula: "ab" }))).ok).toBe(false);
    expect((await crearMjrv(sesion, datos({ cedula: "0000000002", nombres: "" }))).ok).toBe(false);
    expect((await crearMjrv(sesion, datos({ cedula: "0000000002", telefono: "123" }))).ok).toBe(false);
  });

  it("un alta manual solo admite un cargo del catálogo", async () => {
    expect(await crearMjrv(sesion, datos({ cedula: "0000000002", cargo: "otro" })))
      .toEqual({ ok: false, mensaje: "Elija el cargo." });
    expect(await crearMjrv(sesion, datos({ cedula: "0000000002", cargo: "" })))
      .toEqual({ ok: false, mensaje: "Elija el cargo." });
  });

  it("editar mantiene la cédula única y conserva un rótulo importado", async () => {
    const b = await crearMjrv(sesion, datos({ cedula: "0000000002", cargo: "Vocal", junta: "F5" }));
    const id = (b as { id: number }).id;
    await consultarDueno("UPDATE cne.mjrv SET rotulo_credencial = 'F05' WHERE id = $1", [id]);
    expect(await editarMjrv(sesion, id, datos({ cedula: "0000000001" }))).toMatchObject({ ok: false });
    expect((await editarMjrv(sesion, id, datos({ cedula: "0000000002", cargo: "Suplente", junta: "F54" }))).ok).toBe(true);
    expect(await obtenerFicha(id)).toMatchObject({ rol: "suplente", cargo_original: "2do. VOCAL SUPLENTE", origen: "F54", rotulo_credencial: "F05" });
  });

  it("filtros por junta, rol, estado y búsqueda", async () => {
    // «M12» es la junta masculina 12 (serie interna H); «F12» la femenina, que no tiene fichas. «H12» se acepta como masculino.
    expect((await listarMjrv({ junta: "M12" })).map((m) => m.cedula)).toEqual(["0000000001"]);
    expect((await listarMjrv({ junta: "H12" })).map((m) => m.cedula)).toEqual(["0000000001"]);
    expect(await listarMjrv({ junta: "F12" })).toEqual([]);
    expect(await listarMjrv({ junta: "M99", estado: "todos" })).toEqual([]);
    expect((await listarMjrv({ rol: "suplente" })).map((m) => m.cedula)).toEqual(["0000000002"]);
    expect((await listarMjrv({ q: "000000000" })).length).toBe(2);
    expect((await listarMjrv({ q: "%" })).length).toBe(0);
  });

  it("la baja oculta de los activos, conserva el historial y se puede revertir", async () => {
    const [{ id }] = await consultarDueno<{ id: number }>("SELECT id FROM cne.mjrv WHERE cedula = '0000000001'");
    await cambiarBaja(sesion, id, true, "Renuncia");
    expect((await obtenerFicha(id))).toMatchObject({ activo: false, baja_motivo: "Renuncia" });
    expect((await listarMjrv({})).map((m) => m.cedula)).toEqual(["0000000002"]);
    expect((await listarMjrv({ estado: "baja" })).map((m) => m.cedula)).toEqual(["0000000001"]);
    await cambiarBaja(sesion, id, false, "");
    expect((await obtenerFicha(id))?.activo).toBe(true);
  });

  it.each([
    { cedula: "0000000101", rol: "vocal", cargo: "Vocal 2" },
    { cedula: "0000000102", rol: "otro", cargo: "Delegado" },
  ])("editar otros datos conserva el cargo importado ($rol)", async ({ cedula, rol, cargo }) => {
    const [{ id }] = await consultarDueno<{ id: number }>(
      `INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id)
       SELECT $1, 'APELLIDO PRUEBA', 'NOMBRE PRUEBA', $2, $3, id FROM cne.juntas_madrid WHERE serie = 'H' AND numero = 12 RETURNING id`,
      [cedula, cargo, rol],
    );
    expect(await editarMjrv(sesion, id, datos({ cedula, cargo: "", correo: "alta@prueba.cne" }))).toEqual({ ok: true, id });
    expect(await obtenerFicha(id)).toMatchObject({ rol, cargo_original: cargo, correo: "alta@prueba.cne", rotulo_credencial: null });
  });

  it("devuelve todas las fichas del filtro para seleccionarlas de una vez", async () => {
    await consultarDueno(`INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, rotulo_credencial, es_prueba)
      SELECT lpad((1000 + i)::text, 10, '0'), 'APELLIDO PRUEBA MASIVA ' || lpad(i::text, 3, '0'), 'NOMBRE PRUEBA', 'Vocal', 'vocal', j.id, 'H12', true
      FROM generate_series(1, 501) AS i CROSS JOIN cne.juntas_madrid j WHERE j.serie = 'H' AND j.numero = 12`);
    const fichas = await listarMjrv({ q: "APELLIDO PRUEBA MASIVA", junta: "M12", rol: "vocal" });
    expect(fichas).toHaveLength(501);
    expect(fichas.at(-1)).toMatchObject({ cedula: "0000001501", rotulo_credencial: "H12" });
  });
});
