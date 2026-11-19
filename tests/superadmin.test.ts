import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { leerSesion, login } from "@/server/auth";
import { closePools } from "@/server/db";
import { consultarDueno, reiniciarBase } from "./helpers/db";

// Simula cookies y redirecciones de Next para probar las acciones con su guarda real.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined), set: () => undefined, delete: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const acciones = () => import("@/server/superadmin-actions");

async function sesionDe(correo: string, password: string, portal: "admin" | "superadmin") {
  const r = await login({ correo, password, portal, ip: "10.1.1.1", agente: "prueba" });
  if (!r.ok) throw new Error("login");
  return r.token;
}
const datos = (o: Record<string, string>) => Object.entries(o).reduce((f, [k, v]) => (f.set(k, v), f), new FormData());

describe("superadministración", () => {
  beforeAll(async () => {
    await reiniciarBase({ correo: "super@prueba.cne", password: "clave-super-1" });
    await consultarDueno("UPDATE cne.usuarios SET debe_cambiar = false");
  });
  afterAll(closePools);
  beforeEach(() => jar.clear());

  it("una sesión de administración Madrid no puede llamar a las acciones de superadmin", async () => {
    jar.set("cne_super", await sesionDe("super@prueba.cne", "clave-super-1", "superadmin"));
    const a = await acciones();
    const creada = await a.crearAdminAccion(null, datos({ correo: "madrid1@prueba.cne", nombre: "Admin Uno", rol: "consul", password: "clave-madrid-1", repetir: "clave-madrid-1" }));
    expect(creada?.aviso).toMatch(/contraseña/);
    expect(creada?.password).toBeUndefined();
    expect((await a.crearAdminAccion(null, datos({ correo: "corta@prueba.cne", nombre: "Corta", rol: "consul", password: "123", repetir: "123" })))?.error).toMatch(/8/);
    expect((await a.crearAdminAccion(null, datos({ correo: "puerta@prueba.cne", nombre: "Puerta", rol: "puerta", password: "clave-madrid-1", repetir: "clave-madrid-1" })))?.error).toMatch(/Elija el rol/);
    // La cuenta nueva entra con la contraseña que escribió la superadmin y no puede usar las acciones.
    jar.clear();
    const token = await sesionDe("madrid1@prueba.cne", "clave-madrid-1", "admin");
    jar.set("cne_admin", token);
    await expect(a.crearAdminAccion(null, datos({ correo: "x@prueba.cne", nombre: "Otro", rol: "consul", password: "clave-madrid-1", repetir: "clave-madrid-1" }))).rejects.toThrow("REDIRECT:/superadmin/acceso");
    await expect(a.cambiarRolAccion(null, datos({ id: "1", rol: "financiero" }))).rejects.toThrow("REDIRECT:/superadmin/acceso");
    await expect(a.cambiarModoAccion(null, datos({ destino: "eleccion", confirmacion: "MODO ELECCION" }))).rejects.toThrow("REDIRECT:/superadmin/acceso");
    // La cookie del admin puesta como cookie de superadmin tampoco vale.
    jar.set("cne_super", token);
    await expect(a.cambiarModoAccion(null, datos({ destino: "eleccion", confirmacion: "MODO ELECCION" }))).rejects.toThrow("REDIRECT:/superadmin/acceso");
    expect((await consultarDueno<{ modo: string }>("SELECT modo FROM cne.configuracion"))[0].modo).toBe("prueba");
  });

  it("la superadmin cambia el permiso, desactiva la cuenta y puede restablecer la contraseña", async () => {
    jar.set("cne_super", await sesionDe("super@prueba.cne", "clave-super-1", "superadmin"));
    const a = await acciones();
    const [c] = await consultarDueno<{ id: number; debe_cambiar: boolean; rol: string }>("SELECT id, debe_cambiar, rol FROM cne.usuarios WHERE correo = 'madrid1@prueba.cne'");
    expect(c).toMatchObject({ debe_cambiar: false, rol: "consul" });
    expect((await a.cambiarRolAccion(null, datos({ id: String(c.id), rol: "financiero" })))?.aviso).toMatch(/Permiso/);
    expect((await consultarDueno<{ rol: string }>("SELECT rol FROM cne.usuarios WHERE id = $1", [c.id]))[0].rol).toBe("financiero");
    const entra = await login({ correo: "madrid1@prueba.cne", password: "clave-madrid-1", portal: "admin", ip: null, agente: null });
    if (!entra.ok) throw new Error("login");
    expect(await leerSesion(entra.token, "admin")).toMatchObject({ rol: "financiero" });
    const r = await a.restablecerAdminAccion(null, datos({ id: String(c.id) }));
    expect(r?.password).toBeTruthy();
    expect((await consultarDueno<{ debe_cambiar: boolean }>("SELECT debe_cambiar FROM cne.usuarios WHERE id = $1", [c.id]))[0].debe_cambiar).toBe(true);
    await a.activarAdminAccion(datos({ id: String(c.id), activo: "0" }));
    expect((await login({ correo: "madrid1@prueba.cne", password: r!.password!, portal: "admin", ip: null, agente: null })).ok).toBe(false);
  });

  it("el cambio de modo exige la frase, se audita y no se repite", async () => {
    jar.set("cne_super", await sesionDe("super@prueba.cne", "clave-super-1", "superadmin"));
    const a = await acciones();
    expect((await a.cambiarModoAccion(null, datos({ destino: "eleccion", confirmacion: "si" })))?.error).toMatch(/Escriba/);
    expect((await a.cambiarModoAccion(null, datos({ destino: "eleccion", confirmacion: "modo elección" })))?.aviso).toMatch(/elección/);
    expect((await a.cambiarModoAccion(null, datos({ destino: "eleccion", confirmacion: "MODO ELECCION" })))?.error).toMatch(/ya está/);
    expect((await a.cambiarModoAccion(null, datos({ destino: "prueba", confirmacion: "MODO PRUEBA" })))?.aviso).toMatch(/prueba/);
    const aud = await consultarDueno<{ datos: { de: string; a: string } }>("SELECT datos FROM cne.auditoria WHERE accion = 'modo_cambiado' ORDER BY id");
    expect(aud.map((x) => x.datos)).toEqual([{ de: "prueba", a: "eleccion" }, { de: "eleccion", a: "prueba" }]);
  });
});
