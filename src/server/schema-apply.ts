import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { masterKey } from "./crypto";
import { loadEnv } from "./env";
import { hashPassword } from "./passwords";

const RAIZ = process.cwd();
const leer = (...partes: string[]) => readFileSync(path.join(RAIZ, ...partes), "utf8");

export type ResultadoPreparar = { esquemaNuevo: boolean; migraciones: string[]; juntas: number; superadminCreada: boolean };

// Idempotente: se puede ejecutar en cada arranque. Un candado de sesión evita dos preparaciones a la vez.
export async function prepararBase(opciones: { url?: string; superadmin?: { correo?: string; password?: string } } = {}): Promise<ResultadoPreparar> {
  loadEnv();
  // Falla pronto y con mensaje claro si la clave maestra no es válida (fotos y secretos dependen de ella).
  masterKey();
  const url = opciones.url || process.env.DATABASE_OWNER_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_OWNER_URL o DATABASE_URL.");

  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  try {
    await cliente.query("SELECT pg_advisory_lock(4242)");
    const resultado: ResultadoPreparar = { esquemaNuevo: false, migraciones: [], juntas: 0, superadminCreada: false };

    const existe = await cliente.query("SELECT to_regnamespace('cne') IS NOT NULL AS existe");
    if (!existe.rows[0].existe) {
      await cliente.query("BEGIN");
      try {
        await cliente.query(leer("db", "schema.sql"));
        await cliente.query("COMMIT");
      } catch (error) {
        await cliente.query("ROLLBACK");
        throw error;
      }
      resultado.esquemaNuevo = true;
    }

    // Migraciones aditivas, en orden de nombre, cada una en su transacción.
    const hechas = new Set((await cliente.query("SELECT nombre FROM cne.migraciones")).rows.map((r) => r.nombre as string));
    const archivos = readdirSync(path.join(RAIZ, "db", "migrations")).filter((f) => f.endsWith(".sql")).sort();
    for (const archivo of archivos) {
      if (hechas.has(archivo)) continue;
      await cliente.query("BEGIN");
      try {
        await cliente.query(leer("db", "migrations", archivo));
        await cliente.query("INSERT INTO cne.migraciones (nombre) VALUES ($1)", [archivo]);
        await cliente.query("COMMIT");
      } catch (error) {
        await cliente.query("ROLLBACK");
        throw new Error(`Falló la migración ${archivo}: ${(error as Error).message}`);
      }
      resultado.migraciones.push(archivo);
    }

    await cliente.query(leer("db", "seed", "juntas-madrid.sql"));
    resultado.juntas = (await cliente.query("SELECT count(*)::int AS n FROM cne.juntas_madrid")).rows[0].n;
    await cliente.query(leer("db", "grants.sql"));

    const hay = await cliente.query("SELECT 1 FROM cne.usuarios WHERE tipo = 'superadmin' LIMIT 1");
    if (hay.rowCount === 0) {
      const correo = (opciones.superadmin?.correo || process.env.SUPERADMIN_EMAIL || "superadmin@cne.local").trim().toLowerCase();
      const password = opciones.superadmin?.password || process.env.SUPERADMIN_PASSWORD_INICIAL;
      if (!password) throw new Error("No hay superadmin y falta SUPERADMIN_PASSWORD_INICIAL para crearla.");
      await cliente.query(
        "INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash, debe_cambiar) VALUES ('superadmin', $1, 'Superadministración', $2, true) ON CONFLICT (correo) DO NOTHING",
        [correo, await hashPassword(password)],
      );
      resultado.superadminCreada = true;
    }
    await cliente.query("SELECT pg_advisory_unlock(4242)");
    return resultado;
  } finally {
    await cliente.end();
  }
}
