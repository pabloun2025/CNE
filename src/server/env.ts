import { existsSync, readFileSync } from "node:fs";

let loaded = false;

export function loadEnv(): void {
  const path = ".env";
  if (loaded) return;
  loaded = true;
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function requiredEnv(name: string): string {
  loadEnv();
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable ${name}.`);
  return value;
}

// Las cookies llevan «secure» solo cuando el despliegue lo indica (detrás de HTTPS).
export function cookieSecure(): boolean {
  loadEnv();
  return process.env.COOKIE_SECURE === "1";
}
