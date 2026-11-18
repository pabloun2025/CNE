import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { login } from "@/server/auth";
import { closePools } from "@/server/db";
import { prepararBase } from "@/server/schema-apply";
import { consultarDueno, reiniciarBase } from "./helpers/db";

// C1 · La superadmin pasa a pabloun@gmail.com y define su contraseña en el primer acceso.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined), set: (n: string, v: string) => void jar.set(n, v), delete: (n: string) => void jar.delete(n) }),
  headers: async () => new Headers({ "cf-connecting-ip": "10.7.7.7" }),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const PABLO = "pabloun@gmail.com";
const datos = (o: Record<string, string>) => Object.entries(o).reduce((f, [k, v]) => (f.set(k, v), f), new FormData());
const acciones = () => import("@/server/acceso-actions");
const preparar = () => prepararBase({ url: process.env.DATABASE_TEST_URL });
const supers = () => consultarDueno<{ correo: string; password_hash: string | null; password_pendiente: boolean; debe_cambiar: boolean }>("SELECT correo, password_hash, password_pendiente, debe_cambiar FROM cne.usuarios WHERE tipo = 'superadmin'");

describe("superadmin de Pablo", () => {
  beforeAll(() => { delete process.env.SUPERADMIN_EMAIL; delete process.env.SUPERADMIN_PASSWORD_INICIAL; });
  afterAll(closePools);
  beforeEach(async () => {
    jar.clear();
    await reiniciarBase({ correo: "superadmin@cne.local", password: "clave-vieja-1" });
    await consultarDueno("DELETE FROM cne.intentos_acceso");
  });

  it("sin 2FA: el correo cambia, la contraseña queda pendiente y se cierran las sesiones", async () => {
    const r = await login({ correo: "superadmin@cne.local", password: "clave-vieja-1", portal: "superadmin", ip: null, agente: null });
    expect(r.ok).toBe(true);
    await preparar();
    expect(await supers()).toEqual([{ correo: PABLO, password_hash: null, password_pendiente: true, debe_cambiar: true }]);
    expect((await consultarDueno("SELECT 1 FROM cne.sesiones WHERE revocada_en IS NULL")).length).toBe(0);
    expect((await login({ correo: PABLO, password: "clave-vieja-1", portal: "superadmin", ip: null, agente: null })).ok).toBe(false);
  });

  it("con 2FA configurada: solo cambia el correo y se conserva la contraseña", async () => {
    const [antes] = await supers();
    await consultarDueno("UPDATE cne.usuarios SET mfa_activada_en = now() WHERE tipo = 'superadmin'");
    await preparar();
    const [despues] = await supers();
    expect(despues).toMatchObject({ correo: PABLO, password_hash: antes.password_hash, password_pendiente: false });
    expect((await login({ correo: PABLO, password: "clave-vieja-1", portal: "superadmin", ip: null, agente: null })).ok).toBe(true);
  });

  it("sin ninguna superadmin: se crea con contraseña pendiente; repetir el arranque no la vuelve a dejar pendiente", async () => {
    await consultarDueno("DELETE FROM cne.usuarios WHERE tipo = 'superadmin'");
    expect((await preparar()).superadminCreada).toBe(true);
    expect(await supers()).toMatchObject([{ correo: PABLO, password_hash: null, password_pendiente: true }]);
    await consultarDueno("UPDATE cne.usuarios SET password_hash = 'x', password_pendiente = false WHERE tipo = 'superadmin'");
    expect((await preparar()).superadminCreada).toBe(false);
    expect(await supers()).toMatchObject([{ correo: PABLO, password_hash: "x", password_pendiente: false }]);
  });

  it("SUPERADMIN_PASSWORD_INICIAL se ignora y el SUPERADMIN_EMAIL antiguo no manda", async () => {
    process.env.SUPERADMIN_PASSWORD_INICIAL = "no-se-usa-123";
    process.env.SUPERADMIN_EMAIL = "superadmin@cne.local";
    try {
      await preparar();
      expect(await supers()).toMatchObject([{ correo: PABLO, password_hash: null }]);
    } finally {
      delete process.env.SUPERADMIN_PASSWORD_INICIAL; delete process.env.SUPERADMIN_EMAIL;
    }
  });

  it("acceso: pide definir la contraseña, la guarda una vez y sigue con la 2FA", async () => {
    await preparar();
    const a = await acciones();
    expect(await a.accederSuperadmin(null, datos({ correo: PABLO, password: "" }))).toEqual({ definir: true, correo: PABLO });
    expect(await a.accederSuperadmin(null, datos({ correo: PABLO, nueva: "Distinta-123", repetir: "Otra-12345" }))).toMatchObject({ definir: true, error: "Las dos contraseñas no coinciden." });
    expect(await a.accederSuperadmin(null, datos({ correo: PABLO, nueva: "corta", repetir: "corta" }))).toMatchObject({ definir: true, error: expect.stringContaining("al menos 8") });
    await expect(a.accederSuperadmin(null, datos({ correo: PABLO, nueva: "Mi-clave-segura-1", repetir: "Mi-clave-segura-1" }))).rejects.toThrow("REDIRECT:/superadmin");
    expect(jar.get("cne_super")).toBeTruthy();
    // Sesión sin 2FA verificada: la verificación sigue siendo obligatoria.
    expect((await consultarDueno<{ mfa_verificada: boolean }>("SELECT mfa_verificada FROM cne.sesiones"))[0].mfa_verificada).toBe(false);
    // Ya definida: no hay vuelta atrás por esta vía.
    expect(await a.accederSuperadmin(null, datos({ correo: PABLO, password: "" }))).toEqual({ error: "Correo o contraseña incorrectos." });
    expect(await a.accederSuperadmin(null, datos({ correo: PABLO, nueva: "Otra-clave-nueva-2", repetir: "Otra-clave-nueva-2" }))).toEqual({ error: "Correo o contraseña incorrectos." });
    expect((await login({ correo: PABLO, password: "Mi-clave-segura-1", portal: "superadmin", ip: null, agente: null })).ok).toBe(true);
  });

  it("acceso: otras cuentas no pueden definir contraseña por esta vía y los intentos se limitan", async () => {
    await consultarDueno("INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash, debe_cambiar) VALUES ('madrid_admin','m@prueba.cne','M','x',false)");
    await preparar();
    const a = await acciones();
    expect(await a.accederSuperadmin(null, datos({ correo: "m@prueba.cne", nueva: "Mi-clave-segura-1", repetir: "Mi-clave-segura-1" }))).toEqual({ error: "Correo o contraseña incorrectos." });
    expect(await a.accederAdmin(null, datos({ correo: PABLO, password: "" }))).toEqual({ error: "Correo o contraseña incorrectos." });
    for (let i = 0; i < 10; i++) await a.accederSuperadmin(null, datos({ correo: PABLO, nueva: "a", repetir: "b" }));
    // Bloqueado: ya no ofrece definir ni deja hacerlo.
    expect(await a.accederSuperadmin(null, datos({ correo: PABLO, password: "" }))).toEqual({ error: "Correo o contraseña incorrectos." });
    expect(await a.accederSuperadmin(null, datos({ correo: PABLO, nueva: "Mi-clave-segura-1", repetir: "Mi-clave-segura-1" }))).toEqual({ error: "Correo o contraseña incorrectos." });
    expect((await supers())[0].password_pendiente).toBe(true);
  });
});
