import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { activarOperador, crearEnlace, crearOperador, enlacePorToken, identificarEstacion, identificarPuerta, listarEnlaces, restablecerPin, revocarEnlace, validarEstacion } from "@/server/estaciones";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const admin: Sesion = { sesionId: "x", usuarioId: 1, correo: "a@x.y", nombre: "Admin", tipo: "madrid_admin", rol: "consul", debeCambiar: false, mfaVerificada: false };

async function nuevo(funcion: string, nombre: string, funciones: string[], pin = "1234") {
  const e = await crearEnlace(admin, funcion, `${funcion} de prueba`);
  const o = await crearOperador(admin, nombre, "Prueba", funciones, pin);
  if (!e.ok || !o.ok) throw new Error("preparación");
  return { token: e.token, enlaceId: e.id, operadorId: o.id };
}

describe("estaciones: operadores, PIN y enlaces", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash) VALUES ('madrid_admin','a@x.y','A','x')");
  });
  afterAll(closePools);

  it("valida el PIN de 4 dígitos y el nombre con apellido único entre activos", async () => {
    expect((await crearOperador(admin, "Op", "Uno", ["puerta"], "12a4")).ok).toBe(false);
    expect((await crearOperador(admin, "Op", "Uno", ["puerta"], "123")).ok).toBe(false);
    expect((await crearOperador(admin, "Op", "Uno", [], "1234")).ok).toBe(false);
    expect((await crearOperador(admin, "Op", "U", ["puerta"], "1234")).ok).toBe(false);
    expect((await crearOperador(admin, "Op Único", "Uno", ["puerta"], "1234")).ok).toBe(true);
    expect((await crearOperador(admin, "op único", "uno", ["finanzas"], "1234")).ok).toBe(false);
    expect((await crearOperador(admin, "Op Único", "Dos", ["finanzas"], "1234")).ok).toBe(true);
  });

  it("el token se guarda con hash y cifrado, y el admin puede volver a verlo", async () => {
    const e = await crearEnlace(admin, "puerta", "Puerta 1");
    if (!e.ok) throw new Error();
    const [fila] = await consultarDueno<{ token_hash: Buffer; token_cifrado: Buffer }>("SELECT token_hash, token_cifrado FROM cne.enlaces_estacion WHERE id = $1", [e.id]);
    expect(fila.token_cifrado.toString()).not.toContain(e.token);
    expect(fila.token_hash).toHaveLength(32);
    expect((await listarEnlaces()).find((x) => x.id === e.id)?.token).toBe(e.token);
    expect((await enlacePorToken(e.token))?.funcion).toBe("puerta");
    expect(await enlacePorToken("inventado-inventado-inventado")).toBeNull();
  });

  it("la puerta identifica con nombre, apellido y PIN, sin lista", async () => {
    const { token } = await nuevo("puerta", "Elena", ["puerta"], "2468");
    expect(await identificarPuerta(token, " elena ", "prueba", "2468", "tablet")).toMatchObject({ ok: true });
    expect(await identificarPuerta(token, "Elena", "Otro", "2468", null)).toMatchObject({ ok: false, codigo: "pin" });
    expect(await identificarPuerta(token, "Elena", "Prueba", "0000", null)).toMatchObject({ ok: false, mensaje: expect.stringContaining("PIN incorrecto") });
  });

  it("PIN correcto abre sesión; PIN erróneo avisa de los intentos que quedan y bloquea al 5.º", async () => {
    const { token, operadorId } = await nuevo("puerta", "Ana Puerta", ["puerta"], "4321");
    const mal = await identificarEstacion(token, operadorId, "0000", "tablet");
    expect(mal).toMatchObject({ ok: false, mensaje: "PIN incorrecto. Le quedan 4 intentos." });
    for (let i = 0; i < 3; i++) await identificarEstacion(token, operadorId, "0000", null);
    expect(await identificarEstacion(token, operadorId, "0000", null)).toMatchObject({ ok: false, codigo: "bloqueado" });
    // Bloqueado: ni siquiera el PIN correcto entra.
    expect(await identificarEstacion(token, operadorId, "4321", null)).toMatchObject({ ok: false, codigo: "bloqueado" });
    // Restablecer el PIN desbloquea.
    await restablecerPin(admin, operadorId, "5555");
    const bien = await identificarEstacion(token, operadorId, "5555", "tablet");
    expect(bien.ok).toBe(true);
  });

  it("20 fallos en un enlace lo bloquean 15 minutos", async () => {
    const { token, operadorId } = await nuevo("mando", "Beto Mando", ["mando"]);
    await consultarDueno("INSERT INTO cne.intentos_acceso (clave, exito) SELECT 'enlace:' || id, false FROM cne.enlaces_estacion, generate_series(1,20) WHERE funcion = 'mando'");
    expect(await identificarEstacion(token, operadorId, "1234", null)).toMatchObject({ ok: false, codigo: "bloqueado" });
  });

  it("revocar el enlace invalida sus sesiones al instante y muestra «ya no está activo»", async () => {
    const { token, enlaceId, operadorId } = await nuevo("puerta", "Carla Puerta", ["puerta"]);
    const r = await identificarEstacion(token, operadorId, "1234", null);
    if (!r.ok) throw new Error();
    expect((await validarEstacion(r.sesionToken, ["puerta"])).ok).toBe(true);
    await revocarEnlace(admin, enlaceId);
    expect(await validarEstacion(r.sesionToken, ["puerta"])).toEqual({ ok: false, status: 401 });
    expect(await identificarEstacion(token, operadorId, "1234", null)).toMatchObject({ ok: false, codigo: "enlace_inactivo", mensaje: "Este enlace ya no está activo. Pida uno nuevo a la administración." });
  });

  it("desactivar al operador invalida su sesión", async () => {
    const { token, operadorId } = await nuevo("puerta", "Dani Puerta", ["puerta"]);
    const r = await identificarEstacion(token, operadorId, "1234", null);
    if (!r.ok) throw new Error();
    await activarOperador(admin, operadorId, false);
    expect((await validarEstacion(r.sesionToken, ["puerta"])).ok).toBe(false);
  });

  it("un enlace de puerta no sirve para finanzas: 403; un operador sin la función no entra por ese enlace", async () => {
    const { token, operadorId } = await nuevo("puerta", "Eva Doble", ["puerta"]);
    const r = await identificarEstacion(token, operadorId, "1234", null);
    if (!r.ok) throw new Error();
    expect(await validarEstacion(r.sesionToken, ["finanzas"])).toEqual({ ok: false, status: 403 });
    expect(await validarEstacion(undefined, ["puerta"])).toEqual({ ok: false, status: 401 });
    const fin = await crearEnlace(admin, "finanzas", "Finanzas 1");
    if (!fin.ok) throw new Error();
    expect(await identificarEstacion(fin.token, operadorId, "1234", null)).toMatchObject({ ok: false, codigo: "pin" });
  });
});
