import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Extrae el generador de .env.production del script de despliegue y lo prueba sin servidor.
const script = readFileSync("scripts/deploy-oracle.sh", "utf8");
const python = script.slice(script.indexOf("<<'PY'\n") + 7, script.lastIndexOf("\nPY\n"));

function ejecutar(dir: string, paquete: object) {
  const generador = path.join(dir, "gen.py");
  const bootstrap = path.join(dir, "bootstrap.json");
  writeFileSync(generador, python);
  writeFileSync(bootstrap, JSON.stringify(paquete));
  return spawnSync("python3", [generador, bootstrap, path.join(dir, "env")], { encoding: "utf8" });
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
});
