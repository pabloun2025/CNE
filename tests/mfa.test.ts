import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { base32Encode, generateRecoveryCodes, otpauthUri, totpCode, totpCounter, verifyTotp } from "@/domain/totp";
import { leerSesion, login } from "@/server/auth";
import { closePools } from "@/server/db";
import { comenzarMfa, completarMfa, estadoMfa, usarCodigoRecuperacion, verificarMfa } from "@/server/mfa";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined), set: () => undefined, delete: (n: string) => void jar.delete(n) }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

describe("TOTP (RFC 6238)", () => {
  const secreto = base32Encode(Buffer.from("12345678901234567890"));
  it.each([[59, "287082"], [1111111109, "081804"], [1234567890, "005924"]])("t=%i da %s", (s, codigo) => {
    expect(totpCode(secreto, totpCounter(new Date(s * 1000)))).toBe(codigo);
  });
  it("admite un periodo de desfase y no repite el mismo código", () => {
    const ahora = new Date("2026-11-18T10:00:15Z");
    const c = totpCounter(ahora);
    expect(verifyTotp(secreto, totpCode(secreto, c - 1), ahora, null)).toBe(c - 1);
    expect(verifyTotp(secreto, totpCode(secreto, c - 2), ahora, null)).toBeNull();
    expect(verifyTotp(secreto, totpCode(secreto, c), ahora, c)).toBeNull();
  });
  it("10 códigos de recuperación distintos y URI con el emisor", () => {
    const codigos = generateRecoveryCodes();
    expect(new Set(codigos).size).toBe(10);
    expect(otpauthUri("ABC", "a@b.c")).toContain("issuer=CNE%20Madrid");
  });
});

describe("verificación en dos pasos de la superadmin", () => {
  const nuevaSesion = async () => {
    const r = await login({ correo: "super@prueba.cne", password: "clave-super-1", portal: "superadmin", ip: "10.2.2.2", agente: "prueba" });
    if (!r.ok) throw new Error("login");
    jar.set("cne_super", r.token);
    return (await leerSesion(r.token, "superadmin"))!;
  };

  beforeAll(async () => {
    await reiniciarBase({ correo: "super@prueba.cne", password: "clave-super-1" });
    await consultarDueno("UPDATE cne.usuarios SET debe_cambiar = false");
  });
  afterAll(closePools);
  beforeEach(() => jar.clear());

  it("sin verificación no se abre nada de /superadmin y las acciones tampoco", async () => {
    await nuevaSesion();
    const { requireSuperadmin, sesionApi } = await import("@/server/guard");
    await expect(requireSuperadmin()).rejects.toThrow("REDIRECT:/superadmin/verificacion");
    expect(await sesionApi("superadmin")).toBeNull();
    const a = await import("@/server/superadmin-actions");
    await expect(a.cambiarModoAccion(null, new FormData())).rejects.toThrow("REDIRECT:/superadmin/verificacion");
    // La propia pantalla de verificación sí se puede abrir.
    expect((await requireSuperadmin({ permitirSinMfa: true })).mfaVerificada).toBe(false);
  });

  let secreto = "";
  let codigos: string[] = [];

  it("alta: el secreto se guarda cifrado, un código erróneo no la activa y uno bueno sí", async () => {
    const s = await nuevaSesion();
    await comenzarMfa(s);
    const e = await estadoMfa(s);
    secreto = e!.pendiente!.secreto;
    codigos = e!.pendiente!.codigos;
    expect(codigos).toHaveLength(10);
    // En la base no hay rastro del secreto ni de los códigos en claro.
    const [f] = await consultarDueno<{ t: string }>("SELECT (mfa_pendiente::text || coalesce(mfa_secreto::text,'')) AS t FROM cne.usuarios WHERE tipo = 'superadmin'");
    expect(f.t).not.toContain(secreto);
    expect(await completarMfa(s, "000000", new Date())).toBe("invalido");
    const ahora = new Date();
    expect(await completarMfa(s, totpCode(secreto, totpCounter(ahora)), ahora)).toBe("ok");
    expect((await leerSesion(jar.get("cne_super"), "superadmin"))?.mfaVerificada).toBe(true);
    const filas = await consultarDueno<{ n: number }>("SELECT count(*)::int AS n FROM cne.codigos_recuperacion");
    expect(filas[0].n).toBe(10);
    const [g] = await consultarDueno<{ t: string }>("SELECT string_agg(codigo_hash, ',') AS t FROM cne.codigos_recuperacion");
    expect(g.t).not.toContain(codigos[0]);
  });

  it("nueva sesión: pide código; el código ya usado se rechaza y uno nuevo entra", async () => {
    const s = await nuevaSesion();
    expect(s.mfaVerificada).toBe(false);
    const ahora = new Date();
    const c = totpCounter(ahora);
    // El contador del alta ya está usado: ese código se rechaza.
    const [{ ultimo }] = await consultarDueno<{ ultimo: string }>("SELECT mfa_ultimo_contador AS ultimo FROM cne.usuarios WHERE tipo = 'superadmin'");
    expect(await verificarMfa(s, totpCode(secreto, Number(ultimo)), ahora)).toBe("invalido");
    expect(await verificarMfa(s, totpCode(secreto, c + 1), ahora)).toBe("ok");
    expect((await leerSesion(jar.get("cne_super"), "superadmin"))?.mfaVerificada).toBe(true);
    // Reutilizar ese mismo código en otra sesión falla.
    const s2 = await nuevaSesion();
    expect(await verificarMfa(s2, totpCode(secreto, c + 1), ahora)).toBe("invalido");
  });

  it("código de recuperación: sirve una sola vez", async () => {
    await consultarDueno("DELETE FROM cne.intentos_acceso WHERE clave LIKE 'mfa:%'");
    const s = await nuevaSesion();
    expect(await usarCodigoRecuperacion(s, "xxxx-xxxx")).toBe("invalido");
    expect(await usarCodigoRecuperacion(s, codigos[0])).toBe("ok");
    const s2 = await nuevaSesion();
    expect(await usarCodigoRecuperacion(s2, codigos[0])).toBe("invalido");
  });

  it("cinco fallos bloquean la cuenta y cierran sus sesiones", async () => {
    await consultarDueno("DELETE FROM cne.intentos_acceso");
    const s = await nuevaSesion();
    const resultados: string[] = [];
    for (let i = 0; i < 6; i++) resultados.push(await verificarMfa(s, "123456", new Date()));
    expect(resultados.slice(0, 4)).toEqual(["invalido", "invalido", "invalido", "invalido"]);
    expect(resultados.slice(4)).toEqual(["bloqueado", "bloqueado"]);
    expect(await leerSesion(jar.get("cne_super"), "superadmin")).toBeNull();
  });
});
