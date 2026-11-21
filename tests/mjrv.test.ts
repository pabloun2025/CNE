import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { cambiarBaja, crearMjrv, editarMjrv, listarMjrv, obtenerFicha, type DatosMjrv } from "@/server/mjrv";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const sesion: Sesion = { sesionId: "x", usuarioId: 1, correo: "a@x.y", nombre: "Admin", tipo: "madrid_admin", rol: "consul", debeCambiar: false };
const datos = (o: Partial<DatosMjrv> = {}): DatosMjrv => ({ cedula: "0000000001", apellidos: "APELLIDO PRUEBA 001", nombres: "NOMBRE PRUEBA", cargo: "Presidente", junta: "H12", correo: "", telefono: "", rotulo: "", ...o });

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
    expect(f).toMatchObject({ rol: "presidente", origen: "H12", vigente: "H12", activo: true, es_prueba: false, rotulo_credencial: null });
    expect(await crearMjrv(sesion, datos({ junta: "H13" }))).toEqual({ ok: false, mensaje: "Ya existe una ficha con esa cédula." });
  });

  it("rechaza junta inexistente, cédula inválida y datos vacíos", async () => {
    expect((await crearMjrv(sesion, datos({ cedula: "0000000002", junta: "H42" }))).ok).toBe(false);
    expect((await crearMjrv(sesion, datos({ cedula: "ab" }))).ok).toBe(false);
    expect((await crearMjrv(sesion, datos({ cedula: "0000000002", nombres: "" }))).ok).toBe(false);
    expect((await crearMjrv(sesion, datos({ cedula: "0000000002", telefono: "123" }))).ok).toBe(false);
  });

  it("editar mantiene la cédula única y cambia el rótulo", async () => {
    const b = await crearMjrv(sesion, datos({ cedula: "0000000002", cargo: "Vocal", junta: "M5" }));
    const id = (b as { id: number }).id;
    expect(await editarMjrv(sesion, id, datos({ cedula: "0000000001" }))).toMatchObject({ ok: false });
    expect((await editarMjrv(sesion, id, datos({ cedula: "0000000002", cargo: "Suplente", junta: "M5", rotulo: "M05" }))).ok).toBe(true);
    expect(await obtenerFicha(id)).toMatchObject({ rol: "suplente", rotulo_credencial: "M05" });
  });

  it("filtros por junta, rol, estado y búsqueda", async () => {
    expect((await listarMjrv({ junta: "H12" })).map((m) => m.cedula)).toEqual(["0000000001"]);
    expect(await listarMjrv({ junta: "H99", estado: "todos" })).toEqual([]);
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

  it("devuelve todas las fichas del filtro para seleccionarlas de una vez", async () => {
    await consultarDueno(`INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, rotulo_credencial, es_prueba)
      SELECT lpad((1000 + i)::text, 10, '0'), 'APELLIDO PRUEBA MASIVA ' || lpad(i::text, 3, '0'), 'NOMBRE PRUEBA', 'Vocal', 'vocal', j.id, 'H12', true
      FROM generate_series(1, 501) AS i CROSS JOIN cne.juntas_madrid j WHERE j.serie = 'H' AND j.numero = 12`);
    const fichas = await listarMjrv({ q: "APELLIDO PRUEBA MASIVA", junta: "H12", rol: "vocal" });
    expect(fichas).toHaveLength(501);
    expect(fichas.at(-1)).toMatchObject({ cedula: "0000001501", rotulo_credencial: "H12" });
  });
});
