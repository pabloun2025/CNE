import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import type { SesionEstacion } from "@/server/estaciones";
import { contadoresPuerta, dejarPasar, registrarLectura } from "@/server/puerta";
import { listarActivos, listarFueraDeLista, revocarFueraDeLista, revocarMjrv } from "@/server/revocar-credencial";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const sesion: Sesion = { sesionId: "x", usuarioId: 1, correo: "a@x.y", nombre: "Admin Prueba", tipo: "madrid_admin", rol: "consul", debeCambiar: false };
let puerta: SesionEstacion;
let idActivo = 0;
let idBaja = 0;

describe("revocar credencial de MJRV", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash) VALUES ('madrid_admin','a@x.y','Admin Prueba','x')");
    await consultarDueno("INSERT INTO cne.operadores_madrid (nombre, pin_hash, funciones) VALUES ('Op Prueba','x','{puerta}')");
    await consultarDueno("INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('puerta','Puerta 1','\\x11')");
    const j = "(SELECT id FROM cne.juntas_madrid WHERE serie='H' AND numero=12)";
    await consultarDueno(`INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id) VALUES
      ('0000000001','APELLIDO PRUEBA 001','NOMBRE PRUEBA','PRESIDENTE','presidente',${j}),
      ('0000000002','GARCÍA PRUEBA','ANA','VOCAL','vocal',${j}),
      ('0000000003','APELLIDO PRUEBA 003','NOMBRE PRUEBA','VOCAL','vocal',${j})`);
    await consultarDueno("UPDATE cne.mjrv SET activo = false, baja_motivo = 'Renuncia' WHERE cedula = '0000000003'");
    const [o] = await consultarDueno<{ id: number }>("SELECT id FROM cne.operadores_madrid");
    const [e] = await consultarDueno<{ id: number }>("SELECT id FROM cne.enlaces_estacion");
    const ids = await consultarDueno<{ id: number; cedula: string }>("SELECT id, cedula FROM cne.mjrv");
    idActivo = ids.find((x) => x.cedula === "0000000001")!.id;
    idBaja = ids.find((x) => x.cedula === "0000000003")!.id;
    puerta = { sesionId: "x", funcion: "puerta", operadorId: o.id, operadorNombre: "Op Prueba", enlaceId: e.id, etiqueta: "Puerta 1" };
  });
  afterAll(closePools);

  it("lista los activos y revoca el acceso sin dar de baja", async () => {
    expect((await listarActivos()).map((m) => m.cedula).sort()).toEqual(["0000000001", "0000000002"]);
    expect(await revocarMjrv(sesion, idActivo)).toBe(true);
    expect(await revocarMjrv(sesion, idActivo)).toBe(true);
    expect((await consultarDueno("SELECT 1 FROM cne.credenciales_revocadas WHERE mjrv_id = $1", [idActivo])).length).toBe(1);
    expect((await consultarDueno<{ activo: boolean }>("SELECT activo FROM cne.mjrv WHERE id = $1", [idActivo]))[0].activo).toBe(true);
    expect((await listarActivos()).find((m) => m.id === idActivo)?.revocada).toBe(true);
    expect(await listarFueraDeLista()).toEqual([]);
  });

  it("en la puerta una credencial revocada no pasa, ni por cédula ni por el nombre", async () => {
    const antes = await contadoresPuerta(puerta.enlaceId);
    expect(await registrarLectura(puerta, "0000000001", null)).toEqual({ resultado: "revocado" });
    expect(await registrarLectura(puerta, "Apellido Prueba 001, Nombre Prueba", null)).toEqual({ resultado: "revocado" });
    expect(await contadoresPuerta(puerta.enlaceId)).toEqual(antes);
    expect(await dejarPasar(puerta, idActivo)).toEqual({ ok: false, status: 409, mensaje: "La credencial está revocada." });
  });

  it("quien sigue activo y no está revocado pasa; el desconocido no", async () => {
    expect(await registrarLectura(puerta, "0000000002", null)).toMatchObject({ resultado: "valido", nombre: "GARCÍA PRUEBA, ANA", junta: "H12" });
    expect(await registrarLectura(puerta, "9999999999", null)).toEqual({ resultado: "desconocido" });
  });

  it("quien no consta en la lista se revoca, como una entrada, y la puerta no lo deja pasar", async () => {
    expect(await revocarFueraDeLista(sesion, { cedula: " 0000000099 ", apellidos: "AJENO PRUEBA", nombres: "SIN LISTA" })).toEqual({ ok: true, aviso: "Acceso revocado." });
    expect(await revocarFueraDeLista(sesion, { cedula: "0000000099", apellidos: "AJENO PRUEBA", nombres: "SIN LISTA" })).toMatchObject({ ok: true });
    expect((await consultarDueno("SELECT 1 FROM cne.credenciales_revocadas WHERE cedula = '0000000099'")).length).toBe(1);
    expect((await listarFueraDeLista()).map((x) => x.cedula)).toEqual(["0000000099"]);
    expect((await consultarDueno("SELECT 1 FROM cne.mjrv WHERE cedula = '0000000099'")).length).toBe(0);
    expect(await registrarLectura(puerta, "0000000099", null)).toEqual({ resultado: "revocado" });
    expect(await registrarLectura(puerta, "ajeno prueba sin lista", null)).toEqual({ resultado: "revocado" });
  });

  it("una ficha de baja no está en la lista: se puede revocar, y sin revocar seguía bloqueada", async () => {
    expect(await revocarMjrv(sesion, idBaja)).toBe(false);
    expect(await registrarLectura(puerta, "0000000003", null)).toEqual({ resultado: "bloqueado" });
    expect(await revocarFueraDeLista(sesion, { cedula: "0000000003", apellidos: "Otro", nombres: "Nombre" })).toEqual({ ok: true, aviso: "Acceso revocado." });
    expect((await listarFueraDeLista()).find((x) => x.cedula === "0000000003")).toMatchObject({ apellidos: "APELLIDO PRUEBA 003", nombres: "NOMBRE PRUEBA" });
    expect(await registrarLectura(puerta, "0000000003", null)).toEqual({ resultado: "revocado" });
  });

  it("si la cédula está en la lista, el formulario revoca esa ficha y guarda el nombre de la ficha", async () => {
    expect(await revocarFueraDeLista(sesion, { cedula: "0000000002", apellidos: "MAL", nombres: "NOMBRE" })).toEqual({ ok: true, aviso: "Está en la lista. Se revocó su acceso." });
    expect((await listarActivos()).find((m) => m.cedula === "0000000002")?.revocada).toBe(true);
    expect((await listarFueraDeLista()).some((x) => x.cedula === "0000000002")).toBe(false);
    expect(await registrarLectura(puerta, "García Prueba Ana", null)).toEqual({ resultado: "revocado" });
    expect((await consultarDueno<{ apellidos: string }>("SELECT apellidos FROM cne.credenciales_revocadas WHERE cedula = '0000000002'"))[0].apellidos).toBe("GARCÍA PRUEBA");
  });

  it("rechaza cédula o nombre vacío y la búsqueda filtra", async () => {
    expect(await revocarFueraDeLista(sesion, { cedula: "12", apellidos: "A", nombres: "B" })).toMatchObject({ ok: false });
    expect(await revocarFueraDeLista(sesion, { cedula: "0000000088", apellidos: " ", nombres: "B" })).toMatchObject({ ok: false });
    expect((await consultarDueno("SELECT 1 FROM cne.credenciales_revocadas WHERE cedula = '0000000088'")).length).toBe(0);
    expect((await listarActivos("0000000001")).map((m) => m.cedula)).toEqual(["0000000001"]);
    expect(await listarActivos("%")).toEqual([]);
    expect((await consultarDueno<{ n: number }>("SELECT count(*)::int AS n FROM cne.auditoria WHERE accion = 'credencial_revocada'"))[0].n).toBeGreaterThan(0);
  });
});
