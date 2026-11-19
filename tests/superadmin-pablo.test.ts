import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { login } from "@/server/auth";
import { closePools } from "@/server/db";
import { prepararBase } from "@/server/schema-apply";
import { consultarDueno, reiniciarBase } from "./helpers/db";

// La cuenta de Pablo es administración de Madrid y define su contraseña en el primer acceso.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined), set: (n: string, v: string) => void jar.set(n, v), delete: (n: string) => void jar.delete(n) }),
  headers: async () => new Headers({ "cf-connecting-ip": "10.7.7.7" }),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const PABLO = "pabloun@gmail.com";
const MIGRACION = readFileSync("db/migrations/2026-11-24-pablo-admin.sql", "utf8");
const datos = (o: Record<string, string>) => Object.entries(o).reduce((f, [k, v]) => (f.set(k, v), f), new FormData());
const acciones = () => import("@/server/acceso-actions");
const preparar = () => prepararBase({ url: process.env.DATABASE_TEST_URL });
const pablo = () => consultarDueno<{ tipo: string; rol: string; password_hash: string | null; password_pendiente: boolean; debe_cambiar: boolean }>("SELECT tipo, rol, password_hash, password_pendiente, debe_cambiar FROM cne.usuarios WHERE correo = $1", [PABLO]);

describe("cuenta de Pablo", () => {
  beforeAll(() => { delete process.env.SUPERADMIN_EMAIL; delete process.env.SUPERADMIN_PASSWORD_INICIAL; });
  afterAll(closePools);
  beforeEach(async () => {
    jar.clear();
    await reiniciarBase({ correo: "superadmin@cne.local", password: "clave-vieja-1" });
    await consultarDueno("DELETE FROM cne.intentos_acceso");
  });

  it("la preparación la crea como administración, sin contraseña, y no toca la superadmin de prueba", async () => {
    expect((await preparar()).adminCreada).toBe(true);
    expect(await pablo()).toEqual([{ tipo: "madrid_admin", rol: "consul", password_hash: null, password_pendiente: true, debe_cambiar: false }]);
    const supers = await consultarDueno<{ correo: string }>("SELECT correo FROM cne.usuarios WHERE tipo = 'superadmin'");
    expect(supers).toEqual([{ correo: "superadmin@cne.local" }]);
    expect((await login({ correo: PABLO, password: "clave-vieja-1", portal: "admin", ip: null, agente: null })).ok).toBe(false);
  });

  it("repetir el arranque no la vuelve a dejar pendiente ni le inventa contraseña", async () => {
    expect((await preparar()).adminCreada).toBe(true);
    await consultarDueno("UPDATE cne.usuarios SET password_hash = 'x', password_pendiente = false WHERE correo = $1", [PABLO]);
    expect((await preparar()).adminCreada).toBe(false);
    expect(await pablo()).toMatchObject([{ password_hash: "x", password_pendiente: false }]);
  });

  it("SUPERADMIN_PASSWORD_INICIAL y el correo antiguo no cambian la cuenta", async () => {
    process.env.SUPERADMIN_PASSWORD_INICIAL = "no-se-usa-123";
    process.env.SUPERADMIN_EMAIL = "superadmin@cne.local";
    try {
      await preparar();
      expect(await pablo()).toMatchObject([{ tipo: "madrid_admin", password_hash: null, password_pendiente: true }]);
      expect(await consultarDueno("SELECT 1 FROM cne.usuarios WHERE tipo = 'superadmin' AND correo = 'superadmin@cne.local'")).toHaveLength(1);
    } finally {
      delete process.env.SUPERADMIN_PASSWORD_INICIAL; delete process.env.SUPERADMIN_EMAIL;
    }
  });

  it("la migración pasa la superadmin de Pablo a administración, cierra su sesión y no borra la contraseña ya definida", async () => {
    await consultarDueno("UPDATE cne.usuarios SET correo = $1, password_hash = 'hash-viejo', password_pendiente = false, debe_cambiar = false WHERE tipo = 'superadmin'", [PABLO]);
    await consultarDueno("INSERT INTO cne.sesiones (token_hash, usuario_id, portal, expira_en) SELECT '\\xab', id, 'superadmin', now() + interval '1 hour' FROM cne.usuarios WHERE correo = $1", [PABLO]);
    await consultarDueno(MIGRACION);
    expect(await pablo()).toEqual([{ tipo: "madrid_admin", rol: "consul", password_hash: null, password_pendiente: true, debe_cambiar: false }]);
    expect(await consultarDueno("SELECT 1 FROM cne.sesiones WHERE revocada_en IS NULL")).toHaveLength(0);
    await consultarDueno(MIGRACION);
    await consultarDueno("UPDATE cne.usuarios SET password_hash = 'ya-definida', password_pendiente = false WHERE correo = $1", [PABLO]);
    await consultarDueno(MIGRACION);
    expect(await pablo()).toMatchObject([{ password_hash: "ya-definida", password_pendiente: false }]);
  });

  it("acceso: pide definir la contraseña y entra en la administración", async () => {
    await preparar();
    const a = await acciones();
    expect(await a.accederAdmin(null, datos({ correo: PABLO, password: "" }))).toEqual({ definir: true, correo: PABLO });
    expect(await a.accederAdmin(null, datos({ correo: PABLO, nueva: "Distinta-123", repetir: "Otra-12345" }))).toMatchObject({ definir: true, error: "Las dos contraseñas no coinciden." });
    expect(await a.accederAdmin(null, datos({ correo: PABLO, nueva: "corta", repetir: "corta" }))).toMatchObject({ definir: true, error: expect.stringContaining("al menos 8") });
    await expect(a.accederAdmin(null, datos({ correo: PABLO, nueva: "Mi-clave-segura-1", repetir: "Mi-clave-segura-1" }))).rejects.toThrow("REDIRECT:/admin");
    expect(jar.get("cne_admin")).toBeTruthy();
    expect(await a.accederAdmin(null, datos({ correo: PABLO, password: "" }))).toEqual({ error: "Correo o contraseña incorrectos.", correo: PABLO });
    expect(await a.accederAdmin(null, datos({ correo: PABLO, nueva: "Otra-clave-nueva-2", repetir: "Otra-clave-nueva-2" }))).toEqual({ error: "Correo o contraseña incorrectos.", correo: PABLO });
    expect((await login({ correo: PABLO, password: "Mi-clave-segura-1", portal: "admin", ip: null, agente: null })).ok).toBe(true);
    expect((await login({ correo: PABLO, password: "Mi-clave-segura-1", portal: "superadmin", ip: null, agente: null })).ok).toBe(false);
  });

  it("otras cuentas no definen contraseña por esta vía y los intentos se limitan", async () => {
    await consultarDueno("INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash, debe_cambiar) VALUES ('madrid_admin','m@prueba.cne','M','x',false)");
    await preparar();
    const a = await acciones();
    expect(await a.accederAdmin(null, datos({ correo: "m@prueba.cne", nueva: "Mi-clave-segura-1", repetir: "Mi-clave-segura-1" }))).toEqual({ error: "Correo o contraseña incorrectos.", correo: "m@prueba.cne" });
    expect(await a.accederSuperadmin(null, datos({ correo: PABLO, password: "" }))).toEqual({ error: "Correo o contraseña incorrectos.", correo: PABLO });
    for (let i = 0; i < 10; i++) await a.accederAdmin(null, datos({ correo: PABLO, nueva: "a", repetir: "b" }));
    expect(await a.accederAdmin(null, datos({ correo: PABLO, password: "" }))).toEqual({ error: "Correo o contraseña incorrectos.", correo: PABLO });
    expect(await a.accederAdmin(null, datos({ correo: PABLO, nueva: "Mi-clave-segura-1", repetir: "Mi-clave-segura-1" }))).toEqual({ error: "Correo o contraseña incorrectos.", correo: PABLO });
    expect((await pablo())[0].password_pendiente).toBe(true);
  });
});
