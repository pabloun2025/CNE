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
