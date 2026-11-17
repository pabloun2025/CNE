import { types, type Pool, type PoolClient } from "pg";
import { loadEnv, requiredEnv } from "./env";

// Fechas y horas como texto: así no cambian de día por la zona horaria del servidor.
types.setTypeParser(1082, (value) => value);
types.setTypeParser(1083, (value) => value);

let appPool: Pool | null = null;
let ownerPool: Pool | null = null;

function withSearchPath(connectionString: string): string {
  const url = new URL(connectionString);
  const current = url.searchParams.get("options") ?? "";
  if (!current.includes("search_path")) {
    url.searchParams.set("options", `${current} -c search_path=cne,public`.trim());
  }
  return url.toString();
}

async function makePool(connectionString: string, max: number): Promise<Pool> {
  const { Pool: PgPool } = await import("pg");
  return new PgPool({ connectionString: withSearchPath(connectionString), max, connectionTimeoutMillis: 5000 });
}

// Web: rol cne_app (sin DDL ni DELETE en actividad).
export async function getAppPool(): Promise<Pool> {
  if (!appPool) appPool = await makePool(requiredEnv("DATABASE_URL"), 10);
  return appPool;
}

// Dueño del esquema: migraciones, demostración y limpieza. Sin DATABASE_OWNER_URL cae en DATABASE_URL (Render, un solo rol).
export async function getOwnerPool(): Promise<Pool> {
  if (!ownerPool) {
    loadEnv();
    ownerPool = await makePool(process.env.DATABASE_OWNER_URL || requiredEnv("DATABASE_URL"), 2);
  }
  return ownerPool;
}

export async function closePools(): Promise<void> {
  await Promise.all([appPool?.end(), ownerPool?.end()]);
  appPool = null;
  ownerPool = null;
}

async function inTx<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return inTx(await getAppPool(), fn);
}

export async function withOwnerTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return inTx(await getOwnerPool(), fn);
}

export async function query<T extends object = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const pool = await getAppPool();
  return (await pool.query(sql, params)).rows as T[];
}
