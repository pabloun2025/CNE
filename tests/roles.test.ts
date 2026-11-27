import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ENLACES_ADMIN, type RolAdmin } from "@/domain/roles";
import { leerSesion, login } from "@/server/auth";
import { closePools } from "@/server/db";
import { resumenParaRol, type ResumenAdmin } from "@/server/resumen-admin";
import { cambiarRolAdmin, crearAdmin, listarAdmins } from "@/server/superadmin";
import { consultarDueno, reiniciarBase } from "./helpers/db";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));

// C2 · Roles de la administración de Madrid.
const resumen = { generado_en: "x", modoPrueba: true, apertura: { preparadas: 1, pendientes: 0, ingresados: 0, total: 3, completas: 0, incompletas: 0, sinNadie: 0 }, pagos: { documentosCompletos: 0, documentosIncompletos: 0, pagados: 0, pagosSinImporteEur: 0, totalEur: "0" } } as ResumenAdmin;

describe("roles de administración", () => {
  beforeAll(() => reiniciarBase({ correo: "super@prueba.cne", password: "clave-super-1" }));
  afterAll(closePools);

  it("menú: cada rol ve solo sus enlaces", () => {
    const de = (rol: RolAdmin) => ENLACES_ADMIN.filter((e) => e.roles.includes(rol)).map((e) => e.href);
    expect(de("consul")).toHaveLength(ENLACES_ADMIN.length);
    expect(de("coordinador")).toEqual(["/admin/mando"]);
    expect(de("financiero")).toEqual(["/admin", "/admin/finanzas", "/admin/finanzas/pagar", "/admin/finanzas/caja", "/admin/informes"]);
    expect(de("validador")).toEqual(["/admin/validacion-documental"]);
    expect(de("consul")).not.toContain("/admin/configuracion");
  });

  it("el resumen filtra pagos para coordinación y juntas para finanzas", () => {
    expect(resumenParaRol(resumen, "coordinador")).toMatchObject({ pagos: null, apertura: { total: 3 } });
    expect(resumenParaRol(resumen, "financiero")).toMatchObject({ apertura: null, pagos: { totalEur: "0" } });
    expect(resumenParaRol(resumen, "consul")).toMatchObject({ apertura: { total: 3 }, pagos: { totalEur: "0" } });
  });

  it("la superadmin elige el rol y la contraseña al crear la cuenta; sin rol válido no se crea; admite nombre de usuario", async () => {
    const sesion = { sesionId: "x", usuarioId: 1, correo: "s", nombre: "Super", tipo: "superadmin", rol: "consul" as const, debeCambiar: false };
    const clave = "clave-cuenta-1";
    expect((await crearAdmin(sesion, "fin1@prueba.cne", "Fin Uno", "financiero", clave, clave)).ok).toBe(true);
    expect((await crearAdmin(sesion, "coord.uno", "Coord Uno", "coordinador", clave, clave)).ok).toBe(true);
    expect((await crearAdmin(sesion, "otro@prueba.cne", "Otro", "", clave, clave)).ok).toBe(false);
    expect((await crearAdmin(sesion, "otro@prueba.cne", "Otro", "superadmin", clave, clave)).ok).toBe(false);
    expect((await crearAdmin(sesion, "otro@prueba.cne", "Otro", "puerta", clave, clave)).ok).toBe(false);
    expect((await crearAdmin(sesion, "Con Espacios", "Otro", "consul", clave, clave)).ok).toBe(false);
    expect((await crearAdmin(sesion, "corta@prueba.cne", "Corta", "consul", "123", "123")).ok).toBe(false);
    expect((await crearAdmin(sesion, "distinta@prueba.cne", "Distinta", "consul", clave, "otra-clave-9")).ok).toBe(false);
    const roles = Object.fromEntries((await listarAdmins(sesion)).map((a) => [a.correo, a.rol]));
    expect(roles).toEqual({ "fin1@prueba.cne": "financiero", "coord.uno": "coordinador" });
    const fin = (await listarAdmins(sesion)).find((a) => a.correo === "fin1@prueba.cne");
    expect(fin?.debe_cambiar).toBe(false);
    expect((await cambiarRolAdmin(sesion, fin!.id, "coordinador")).ok).toBe(true);
    expect((await listarAdmins(sesion)).find((a) => a.id === fin!.id)?.rol).toBe("coordinador");
    expect((await cambiarRolAdmin(sesion, fin!.id, "puerta")).ok).toBe(false);
    const entra = await login({ correo: "fin1@prueba.cne", password: clave, portal: "admin", ip: null, agente: null });
    if (!entra.ok) throw new Error("login");
    expect(entra.debeCambiar).toBe(false);
    expect((await leerSesion(entra.token, "admin"))?.rol).toBe("coordinador");
  });

  it("la sesión lleva el rol de la cuenta y las cuentas antiguas quedan como consul", async () => {
    await consultarDueno("INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash, debe_cambiar) SELECT 'madrid_admin','vieja@prueba.cne','Vieja', password_hash, false FROM cne.usuarios WHERE tipo = 'superadmin'");
    const r = await login({ correo: "vieja@prueba.cne", password: "clave-super-1", portal: "admin", ip: null, agente: null });
    if (!r.ok) throw new Error("login");
    expect((await leerSesion(r.token, "admin"))?.rol).toBe("consul");
  });
});
