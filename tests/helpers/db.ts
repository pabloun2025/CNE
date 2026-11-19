import { Client } from "pg";

// Crea el rol cne_app de las pruebas si no existe (en producción lo crea docker/postgres-init.sh).
export async function asegurarRolApp(): Promise<void> {
  const cliente = new Client({ connectionString: process.env.DATABASE_TEST_URL });
  await cliente.connect();
  try {
    const clave = process.env.CNE_APP_TEST_PASSWORD!.replace(/'/g, "''");
    await cliente.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cne_app') THEN CREATE ROLE cne_app LOGIN PASSWORD '${clave}'; END IF; END $$`);
  } finally {
    await cliente.end();
  }
}

// Base de pruebas limpia: borra el esquema cne y lo prepara de nuevo.
export async function reiniciarBase(superadmin = { correo: "super@prueba.cne", password: "clave-de-prueba-1" }) {
  const { prepararBase } = await import("@/server/schema-apply");
  await asegurarRolApp();
  const cliente = new Client({ connectionString: process.env.DATABASE_TEST_URL });
  await cliente.connect();
  try {
    await cliente.query("DROP SCHEMA IF EXISTS cne CASCADE");
  } finally {
    await cliente.end();
  }
  return prepararBase({ url: process.env.DATABASE_TEST_URL, superadmin });
}

export async function consultarDueno<T extends object = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const cliente = new Client({ connectionString: process.env.DATABASE_TEST_URL });
  await cliente.connect();
  try {
    return (await cliente.query(sql, params)).rows as T[];
  } finally {
    await cliente.end();
  }
}
