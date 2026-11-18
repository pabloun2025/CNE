import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnv } from "./env";

// Respaldo pg_dump previo a la limpieza (§14.3 paso 3). Vive en el contenedor (se pierde al reiniciarlo): la copia que cuenta es la que se descarga.
export const PATRON_RESPALDO = /^cne-prep-\d{8}T\d{6}Z\.dump$/;
export const carpetaRespaldos = () => process.env.RESPALDO_DIR || path.join(os.tmpdir(), "cne-respaldos");

export type Respaldo = { archivo: string; bytes: number };
export type Respaldador = () => Promise<Respaldo>;

function ejecutar(comando: string, args: string[], env: Record<string, string>): Promise<{ codigo: number | null; salida: string }> {
  return new Promise((resolve, reject) => {
    const hijo = spawn(comando, args, { env: env as unknown as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"] });
    let salida = "";
    hijo.stdout.on("data", (d) => { if (salida.length < 2_000_000) salida += d; });
    hijo.stderr.on("data", (d) => { if (salida.length < 2_000_000) salida += d; });
    hijo.on("error", reject);
    hijo.on("close", (codigo) => resolve({ codigo, salida }));
  });
}

// La contraseña va por variable de entorno del proceso hijo, nunca en los argumentos ni en los mensajes de error.
function entornoPg(): Record<string, string> {
  loadEnv();
  const url = new URL(process.env.DATABASE_OWNER_URL || process.env.DATABASE_URL || "");
  return {
    PATH: process.env.PATH ?? "", PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: url.pathname.replace(/^\//, ""),
  };
}

export const crearRespaldo: Respaldador = async () => {
  const carpeta = carpetaRespaldos();
  mkdirSync(carpeta, { recursive: true, mode: 0o700 });
  const archivo = `cne-prep-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}.dump`;
  const ruta = path.join(carpeta, archivo);
  const env = entornoPg();
  try {
    const volcado = await ejecutar("pg_dump", ["--format=custom", "--no-owner", "--file", ruta], env);
    if (volcado.codigo !== 0) throw new Error("pg_dump terminó con error");
    chmodSync(ruta, 0o600);
    const bytes = statSync(ruta).size;
    if (bytes < 1024) throw new Error("el respaldo salió vacío");
    // Comprobable: pg_restore debe poder leer el índice y debe incluir los datos de las fichas.
    const lista = await ejecutar("pg_restore", ["--list", ruta], env);
    if (lista.codigo !== 0 || !/TABLE DATA cne mjrv\b/.test(lista.salida)) throw new Error("el respaldo no se pudo verificar");
    // Se conservan solo los 3 últimos.
    const todos = readdirSync(/*turbopackIgnore: true*/ carpeta).filter((f) => PATRON_RESPALDO.test(f)).sort().reverse();
    for (const viejo of todos.slice(3)) rmSync(path.join(carpeta, viejo), { force: true });
    return { archivo, bytes };
  } catch (e) {
    if (existsSync(ruta)) rmSync(ruta, { force: true });
    const causa = (e as NodeJS.ErrnoException).code === "ENOENT" ? "pg_dump no está disponible en el servidor" : (e as Error).message;
    throw new Error(`No se pudo crear el respaldo (${causa}).`);
  }
};

export function rutaRespaldo(archivo: string): string | null {
  if (!PATRON_RESPALDO.test(archivo)) return null;
  const ruta = path.join(carpetaRespaldos(), archivo);
  return existsSync(ruta) ? ruta : null;
}
