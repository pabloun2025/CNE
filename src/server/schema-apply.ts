import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import type { RolAdmin } from "../domain/roles";
import { masterKey } from "./crypto";
import { loadEnv } from "./env";
import { hashPassword } from "./passwords";

const RAIZ = process.cwd();
const leer = (...partes: string[]) => readFileSync(path.join(RAIZ, ...partes), "utf8");

// El usuario de acceso es «admin», no un correo. Entra por la administración de Madrid.
export const CORREO_ADMIN = "admin";

export type ResultadoPreparar = { esquemaNuevo: boolean; migraciones: string[]; juntas: number; superadminCreada: boolean; adminCreada: boolean; cuentasMadridCreadas: number };

// Si la cuenta no existe, se crea sin contraseña guardada. El primer ingreso muestra el formulario
// para definirla; una contraseña vacía no abre sesión. Si ya existe, no se toca.
export async function asegurarAdminPablo(cliente: Client): Promise<boolean> {
  const r = await cliente.query(
    `INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash, password_pendiente, debe_cambiar, rol)
     VALUES ('madrid_admin', $1, 'Administración', NULL, true, false, 'consul')
     ON CONFLICT (correo) DO NOTHING`,
    [CORREO_ADMIN],
  );
  return (r.rowCount ?? 0) > 0;
}

// Cuentas de administración de Madrid (C3): se crean solo si faltan; si ya existen no se toca nada (ni contraseña ni estado).
// Contraseña inicial fijada por Pablo, sin obligación de cambiarla (decisión expresa). Solo se guarda su huella argon2id.
const CUENTAS_MADRID: { usuario: string; nombre: string; rol: RolAdmin }[] = [
  { usuario: "coordinador", nombre: "Coordinador", rol: "coordinador" },
  { usuario: "consul", nombre: "Cónsul", rol: "consul" },
  { usuario: "financiero", nombre: "Financiero", rol: "financiero" },
];
const PASSWORD_CUENTAS_MADRID = "Elecciones2026";

export async function asegurarCuentasMadrid(cliente: Client): Promise<number> {
  const existentes = new Set((await cliente.query("SELECT correo FROM cne.usuarios WHERE correo = ANY($1)", [CUENTAS_MADRID.map((c) => c.usuario)])).rows.map((r) => r.correo as string));
  const faltan = CUENTAS_MADRID.filter((c) => !existentes.has(c.usuario));
  if (faltan.length === 0) return 0;
  const hash = await hashPassword(PASSWORD_CUENTAS_MADRID);
  let creadas = 0;
  for (const c of faltan) {
    const r = await cliente.query(
      "INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash, debe_cambiar, rol) VALUES ('madrid_admin', $1, $2, $3, false, $4) ON CONFLICT (correo) DO NOTHING",
      [c.usuario, c.nombre, hash, c.rol],
    );
    creadas += r.rowCount ?? 0;
  }
  return creadas;
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
    const resultado: ResultadoPreparar = { esquemaNuevo: false, migraciones: [], juntas: 0, superadminCreada: false, adminCreada: false, cuentasMadridCreadas: 0 };

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
        const correo = (opciones.superadmin.correo || "").trim().toLowerCase();
        if (!correo) throw new Error("Falta el correo de la superadmin de prueba.");
        await cliente.query(
          "INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash, debe_cambiar) VALUES ('superadmin', $1, 'Superadministración', $2, true) ON CONFLICT (correo) DO NOTHING",
          [correo, await hashPassword(opciones.superadmin.password)],
        );
        resultado.superadminCreada = true;
      }
    } else {
      resultado.adminCreada = await asegurarAdminPablo(cliente);
      resultado.cuentasMadridCreadas = await asegurarCuentasMadrid(cliente);
    }
    await cliente.query("SELECT pg_advisory_unlock(4242)");
    return resultado;
  } finally {
    await cliente.end();
  }
}
