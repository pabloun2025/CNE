import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cambiarContrasena, cerrarSesion, leerSesion, login } from "@/server/auth";
import { closePools } from "@/server/db";
import { hashPassword } from "@/server/passwords";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const entrada = (correo: string, password: string, portal: "admin" | "superadmin" = "admin", ip = "10.0.0.1") => ({ correo, password, portal, ip, agente: "prueba" });

describe("autenticación por tipo de usuario", () => {
  beforeAll(async () => {
    await reiniciarBase({ correo: "super@prueba.cne", password: "clave-de-prueba-1" });
    await consultarDueno("INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash, debe_cambiar) VALUES ('madrid_admin','admin@prueba.cne','Admin Prueba',$1,false)", [await hashPassword("clave-admin-1")]);
  });
  afterAll(closePools);

  it("contraseña errónea: mensaje genérico", async () => {
    const r = await login(entrada("admin@prueba.cne", "mala"));
    expect(r).toEqual({ ok: false, mensaje: "Correo o contraseña incorrectos." });
    expect(await login(entrada("nadie@prueba.cne", "mala"))).toEqual(r);
  });

  it("la cookie de un tipo no vale en el otro portal", async () => {
    const a = await login(entrada("admin@prueba.cne", "clave-admin-1"));
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(await leerSesion(a.token, "admin")).toMatchObject({ tipo: "madrid_admin" });
    expect(await leerSesion(a.token, "superadmin")).toBeNull();
    // Un admin tampoco entra por el acceso de la superadmin ni al revés.
    expect((await login(entrada("admin@prueba.cne", "clave-admin-1", "superadmin"))).ok).toBe(false);
    expect((await login(entrada("super@prueba.cne", "clave-de-prueba-1", "admin"))).ok).toBe(false);
  });

  it("el primer acceso de la superadmin exige cambiar la contraseña", async () => {
    const s = await login(entrada("super@prueba.cne", "clave-de-prueba-1", "superadmin"));
    expect(s.ok && s.debeCambiar).toBe(true);
    if (!s.ok) return;
    expect((await leerSesion(s.token, "superadmin"))?.debeCambiar).toBe(true);
    expect(await cambiarContrasena(s.token, "superadmin", "equivocada", "nueva-clave-2")).toMatchObject({ ok: false });
    expect(await cambiarContrasena(s.token, "superadmin", "clave-de-prueba-1", "corta")).toMatchObject({ ok: false });
    expect(await cambiarContrasena(s.token, "superadmin", "clave-de-prueba-1", "nueva-clave-2")).toEqual({ ok: true });
    expect((await leerSesion(s.token, "superadmin"))?.debeCambiar).toBe(false);
    expect((await login(entrada("super@prueba.cne", "clave-de-prueba-1", "superadmin"))).ok).toBe(false);
  });

  it("sesión revocada o caducada se rechaza", async () => {
    const a = await login(entrada("admin@prueba.cne", "clave-admin-1"));
    if (!a.ok) throw new Error("login");
    await cerrarSesion(a.token);
    expect(await leerSesion(a.token, "admin")).toBeNull();
    const b = await login(entrada("admin@prueba.cne", "clave-admin-1"));
    if (!b.ok) throw new Error("login");
    await consultarDueno("UPDATE cne.sesiones SET expira_en = now() - interval '1 minute'");
    expect(await leerSesion(b.token, "admin")).toBeNull();
    expect(await leerSesion(undefined, "admin")).toBeNull();
  });

  it("usuario desactivado no entra y su sesión deja de valer", async () => {
    const a = await login(entrada("admin@prueba.cne", "clave-admin-1"));
    if (!a.ok) throw new Error("login");
    await consultarDueno("UPDATE cne.usuarios SET activo = false WHERE correo = 'admin@prueba.cne'");
    expect(await leerSesion(a.token, "admin")).toBeNull();
    expect((await login(entrada("admin@prueba.cne", "clave-admin-1"))).ok).toBe(false);
    await consultarDueno("UPDATE cne.usuarios SET activo = true WHERE correo = 'admin@prueba.cne'");
  });

  it("10 fallos por correo bloquean incluso la contraseña correcta", async () => {
    await consultarDueno("DELETE FROM cne.intentos_acceso");
    for (let i = 0; i < 10; i++) await login(entrada("admin@prueba.cne", "mala", "admin", `10.0.1.${i}`));
    expect((await login(entrada("admin@prueba.cne", "clave-admin-1", "admin", "10.0.9.9"))).ok).toBe(false);
    await consultarDueno("DELETE FROM cne.intentos_acceso");
    expect((await login(entrada("admin@prueba.cne", "clave-admin-1", "admin", "10.0.9.9"))).ok).toBe(true);
  });

  it("30 fallos desde una IP bloquean esa IP", async () => {
    await consultarDueno("DELETE FROM cne.intentos_acceso");
    for (let i = 0; i < 30; i++) await login(entrada(`otro${i}@prueba.cne`, "mala", "admin", "10.0.2.2"));
    expect((await login(entrada("admin@prueba.cne", "clave-admin-1", "admin", "10.0.2.2"))).ok).toBe(false);
    expect((await login(entrada("admin@prueba.cne", "clave-admin-1", "admin", "10.0.2.3"))).ok).toBe(true);
  });
});
