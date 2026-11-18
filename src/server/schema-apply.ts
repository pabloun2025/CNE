import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { masterKey } from "./crypto";
import { loadEnv } from "./env";
import { hashPassword } from "./passwords";

const RAIZ = process.cwd();
const leer = (...partes: string[]) => readFileSync(path.join(RAIZ, ...partes), "utf8");

// Correo de la superadmin (Pablo). Un SUPERADMIN_EMAIL antiguo con el valor por defecto de antes se ignora.
export const CORREO_SUPERADMIN = "pabloun@gmail.com";
const CORREO_ANTIGUO = "superadmin@cne.local";
export function correoSuperadmin(): string {
  const env = (process.env.SUPERADMIN_EMAIL || "").trim().toLowerCase();
  return env && env !== CORREO_ANTIGUO ? env : CORREO_SUPERADMIN;
}

export type ResultadoPreparar = { esquemaNuevo: boolean; migraciones: string[]; juntas: number; superadminCreada: boolean };

// La superadmin pasa al correo indicado. Sin 2FA configurada, su contraseña queda pendiente de definir en el primer acceso
// (y se cierran sus sesiones); con 2FA ya configurada solo cambia el correo. Si no hay ninguna, se crea con contraseña pendiente.
// Solo actúa al cambiar el correo: una vez hecho, repetir el arranque no vuelve a dejar la contraseña pendiente.
export async function asegurarSuperadmin(cliente: Client, correo: string): Promise<"creada" | "convertida" | "sin_cambios"> {
  const filas = (await cliente.query("SELECT id, correo, mfa_activada_en FROM cne.usuarios WHERE tipo = 'superadmin' ORDER BY id")).rows;
  if (filas.length === 0) {
    await cliente.query(
      "INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash, password_pendiente, debe_cambiar) VALUES ('superadmin', $1, 'Superadministración', NULL, true, false) ON CONFLICT (correo) DO NOTHING",
      [correo],
    );
    return "creada";
  }
  if (filas.some((f) => f.correo === correo)) return "sin_cambios";
  const f = filas[0];
  await cliente.query("BEGIN");
  try {
    if (f.mfa_activada_en) {
      await cliente.query("UPDATE cne.usuarios SET correo = $1 WHERE id = $2", [correo, f.id]);
    } else {
      await cliente.query("UPDATE cne.usuarios SET correo = $1, password_hash = NULL, password_pendiente = true, fallos = 0, bloqueado_hasta = NULL WHERE id = $2", [correo, f.id]);
      await cliente.query("UPDATE cne.sesiones SET revocada_en = now() WHERE usuario_id = $1 AND revocada_en IS NULL", [f.id]);
    }
    await cliente.query("COMMIT");
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  }
  return "convertida";
}

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

    if (opciones.superadmin?.password) {
      // Camino de las pruebas: superadmin con contraseña explícita, sin conversión.
      const hay = await cliente.query("SELECT 1 FROM cne.usuarios WHERE tipo = 'superadmin' LIMIT 1");
      if (hay.rowCount === 0) {
        const correo = (opciones.superadmin.correo || correoSuperadmin()).trim().toLowerCase();
        await cliente.query(
          "INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash, debe_cambiar) VALUES ('superadmin', $1, 'Superadministración', $2, true) ON CONFLICT (correo) DO NOTHING",
          [correo, await hashPassword(opciones.superadmin.password)],
        );
        resultado.superadminCreada = true;
      }
    } else {
      resultado.superadminCreada = (await asegurarSuperadmin(cliente, correoSuperadmin())) === "creada";
    }
    await cliente.query("SELECT pg_advisory_unlock(4242)");
    return resultado;
  } finally {
    await cliente.end();
  }
}
