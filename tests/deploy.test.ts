import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Extrae el generador de .env.production del script de despliegue y lo prueba sin servidor.
const script = readFileSync("scripts/deploy-oracle.sh", "utf8");
const python = script.slice(script.indexOf("<<'PY'\n") + 7, script.lastIndexOf("\nPY\n"));

function ejecutar(dir: string, paquete: object, consulares = path.join(dir, "sin-consulares")) {
  const generador = path.join(dir, "gen.py");
  const bootstrap = path.join(dir, "bootstrap.json");
  writeFileSync(generador, python);
  writeFileSync(bootstrap, JSON.stringify(paquete));
  return spawnSync("python3", [generador, bootstrap, path.join(dir, "env"), consulares], { encoding: "utf8" });
}
const leer = (dir: string) => Object.fromEntries(readFileSync(path.join(dir, "env"), "utf8").trim().split("\n").map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 2, -1)]));

describe("deploy-oracle.sh · .env.production", () => {
  it("genera clave maestra y contraseña inicial si no llegan, y las conserva", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cne-"));
    expect(ejecutar(dir, { APP_VERSION: "v1" }).status).toBe(0);
    const primera = leer(dir);
    expect(Buffer.from(primera.APP_MASTER_KEY, "base64")).toHaveLength(32);
    expect(primera.SUPERADMIN_PASSWORD_INICIAL.length).toBeGreaterThanOrEqual(16);
    expect(primera.SUPERADMIN_EMAIL).toBe("superadmin@cne.local");
    expect(primera.HOST_MADRID).toBe("");
    expect((statSync(path.join(dir, "env")).mode & 0o777).toString(8)).toBe("600");
    expect(ejecutar(dir, { APP_VERSION: "v2", SUPERADMIN_EMAIL: "a@b.c" }).status).toBe(0);
    const segunda = leer(dir);
    expect(segunda.APP_MASTER_KEY).toBe(primera.APP_MASTER_KEY);
    expect(segunda.POSTGRES_PASSWORD).toBe(primera.POSTGRES_PASSWORD);
    expect(segunda.SUPERADMIN_PASSWORD_INICIAL).toBe(primera.SUPERADMIN_PASSWORD_INICIAL);
    expect(segunda.SUPERADMIN_EMAIL).toBe("a@b.c");
  });

  it("se detiene si la clave maestra del paquete difiere de la del servidor y no imprime valores", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cne-"));
    ejecutar(dir, { APP_VERSION: "v1" });
    const antes = readFileSync(path.join(dir, "env"), "utf8");
    const r = ejecutar(dir, { APP_VERSION: "v2", APP_MASTER_KEY: "otra-clave-secreta-distinta" });
    expect(r.status).not.toBe(0);
    expect(r.stderr + r.stdout).not.toContain("otra-clave-secreta-distinta");
    expect(readFileSync(path.join(dir, "env"), "utf8")).toBe(antes);
  });

  // Archivos ficticios con la forma de los de consulares (solo lectura): nunca claves reales.
  function consularesFalso(dir: string, ...lineas: string[]) {
    const c = path.join(dir, "consulares");
    mkdirSync(path.join(c, "docker"), { recursive: true });
    writeFileSync(path.join(c, ".env.production"), lineas.join("\n"));
    return c;
  }

  it("copia las claves de envío de consulares sin imprimir ningún valor", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cne-"));
    const c = consularesFalso(dir, "EVOLUTION_API_KEY='evo-FICTICIA-123'", "BREVO_API_KEY=brevo-FICTICIA-456", "MAIL_FROM_ADDRESS=prueba@ejemplo.invalid", "OTRA=no-se-copia");
    const r = ejecutar(dir, { APP_VERSION: "v1" }, c);
    expect(r.status).toBe(0);
    const v = leer(dir);
    expect(v).toMatchObject({ EVOLUTION_API_URL: "http://evolution-api:8080", EVOLUTION_API_KEY: "evo-FICTICIA-123", BREVO_API_KEY: "brevo-FICTICIA-456", MAIL_FROM_ADDRESS: "prueba@ejemplo.invalid" });
    expect(v.OTRA).toBeUndefined();
    expect(r.stdout.trim()).toBe("Claves de envío: WhatsApp sí, correo sí");
    for (const secreto of ["evo-FICTICIA-123", "brevo-FICTICIA-456", "prueba@ejemplo.invalid"]) expect(r.stdout + r.stderr).not.toContain(secreto);
  });

  it("si falta EVOLUTION_API_KEY usa AUTHENTICATION_API_KEY de docker/evolution.env", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cne-"));
    const c = consularesFalso(dir, "BREVO_API_KEY=b");
    writeFileSync(path.join(c, "docker", "evolution.env"), "AUTHENTICATION_API_KEY=global-FICTICIA-789\n");
    expect(ejecutar(dir, { APP_VERSION: "v1" }, c).status).toBe(0);
    expect(leer(dir).EVOLUTION_API_KEY).toBe("global-FICTICIA-789");
  });

  it("sin los archivos de consulares el despliegue sigue y las claves quedan vacías (simulado)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cne-"));
    const r = ejecutar(dir, { APP_VERSION: "v1" });
    expect(r.status).toBe(0);
    expect(leer(dir)).toMatchObject({ EVOLUTION_API_KEY: "", BREVO_API_KEY: "", MAIL_FROM_ADDRESS: "" });
    expect(r.stdout.trim()).toBe("Claves de envío: WhatsApp no, correo no");
  });

  it("un archivo de consulares ilegible no detiene el despliegue", () => {
    if (process.getuid?.() === 0) return; // root lee todo: no se puede simular el permiso denegado
    const dir = mkdtempSync(path.join(tmpdir(), "cne-"));
    const c = consularesFalso(dir, "BREVO_API_KEY=b");
    chmodSync(path.join(c, ".env.production"), 0o000);
    expect(ejecutar(dir, { APP_VERSION: "v1" }, c).status).toBe(0);
  });

  it("conserva las claves ya copiadas si consulares no se puede leer", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "cne-"));
    ejecutar(dir, { APP_VERSION: "v1" }, consularesFalso(dir, "BREVO_API_KEY=guardada-FICTICIA"));
    expect(ejecutar(dir, { APP_VERSION: "v2" }).status).toBe(0);
    expect(leer(dir).BREVO_API_KEY).toBe("guardada-FICTICIA");
  });
});
