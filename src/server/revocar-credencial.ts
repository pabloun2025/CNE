import type { PoolClient } from "pg";
import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { query, withTx } from "./db";

// La puerta puede leer la cédula o el nombre impreso. Esta clave junta las dos lecturas.
export function claveAcceso(t: string): string {
  return t.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^0-9A-Z]/g, "");
}

const CEDULA = /^[0-9A-Z-]{5,20}$/;
export const normalizarCedula = (t: string) => t.trim().toUpperCase().replace(/\s+/g, "");

function clavesDe(cedula: string, apellidos: string, nombres: string): string[] {
  return [...new Set([claveAcceso(cedula), claveAcceso(`${apellidos}${nombres}`), claveAcceso(`${nombres}${apellidos}`)].filter((c) => c.length > 0))];
}

export type FilaRevocable = { id: number; cedula: string; apellidos: string; nombres: string; junta: string; revocada: boolean };
export type RevocacionFuera = { id: number; cedula: string; apellidos: string; nombres: string; revocada_en: string };

// La lista aprobada son las fichas activas. Revocada sigue en la lista, marcada, para que se vea.
export async function listarActivos(q?: string): Promise<FilaRevocable[]> {
  const p: unknown[] = [];
  let filtro = "";
  const texto = q?.trim();
  if (texto) {
    p.push(`%${texto.replace(/[\\%_]/g, "\\$&")}%`);
    filtro = "AND (m.apellidos ILIKE $1 OR m.nombres ILIKE $1 OR m.cedula ILIKE $1)";
  }
  return query<FilaRevocable>(
    `SELECT m.id, m.cedula, m.apellidos, m.nombres, jo.serie || jo.numero AS junta,
            EXISTS (SELECT 1 FROM credenciales_revocadas r WHERE r.mjrv_id = m.id OR r.cedula = m.cedula) AS revocada
       FROM mjrv m JOIN juntas_madrid jo ON jo.id = m.junta_origen_id
      WHERE m.activo ${filtro}
      ORDER BY lower(m.apellidos), lower(m.nombres)
      LIMIT 500`,
    p,
  );
}

// Quien no está activo (no consta, o está de baja) y ya se revocó.
export async function listarFueraDeLista(): Promise<RevocacionFuera[]> {
  return query<RevocacionFuera>(
    `SELECT r.id, r.cedula, r.apellidos, r.nombres, r.revocada_en::text
       FROM credenciales_revocadas r
      WHERE NOT EXISTS (SELECT 1 FROM mjrv m WHERE m.activo AND (m.id = r.mjrv_id OR m.cedula = r.cedula))
      ORDER BY r.revocada_en DESC
      LIMIT 200`,
  );
}

async function guardar(client: PoolClient, row: { mjrvId: number | null; cedula: string; apellidos: string; nombres: string; actorId: number; actorNombre: string }) {
  const claves = clavesDe(row.cedula, row.apellidos, row.nombres);
  if (row.mjrvId) {
    const u = await client.query(
      `UPDATE credenciales_revocadas SET cedula = $2, apellidos = $3, nombres = $4, claves = $5::text[], revocada_en = now(), actor_id = $6, actor_nombre = $7 WHERE mjrv_id = $1`,
      [row.mjrvId, row.cedula, row.apellidos, row.nombres, claves, row.actorId, row.actorNombre],
    );
    if ((u.rowCount ?? 0) > 0) return;
  }
  await client.query(
    `INSERT INTO credenciales_revocadas (mjrv_id, cedula, apellidos, nombres, claves, actor_id, actor_nombre)
     VALUES ($1,$2,$3,$4,$5::text[],$6,$7)
     ON CONFLICT (cedula) DO UPDATE SET
       mjrv_id = COALESCE(EXCLUDED.mjrv_id, credenciales_revocadas.mjrv_id),
       apellidos = EXCLUDED.apellidos, nombres = EXCLUDED.nombres, claves = EXCLUDED.claves,
       revocada_en = now(), actor_id = EXCLUDED.actor_id, actor_nombre = EXCLUDED.actor_nombre`,
    [row.mjrvId, row.cedula, row.apellidos, row.nombres, claves, row.actorId, row.actorNombre],
  );
}

function auditar(client: PoolClient, sesion: Sesion, entidad: string, entidadId: string | number, datos: Record<string, unknown>) {
  return registrarAuditoria({ portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "credencial_revocada", entidad, entidadId, datos }, client);
}

// Revoca el acceso de una ficha activa. La ficha sigue activa: solo deja de pasar en la puerta.
export async function revocarMjrv(sesion: Sesion, id: number): Promise<boolean> {
  return withTx(async (client) => {
    // Comparte el bloqueo de ficha con el registro de ingresos.
    const m = (await client.query<{ cedula: string; apellidos: string; nombres: string }>("SELECT cedula, apellidos, nombres FROM mjrv WHERE id = $1 AND activo FOR UPDATE", [id])).rows[0];
    if (!m) return false;
    await guardar(client, { mjrvId: id, cedula: m.cedula, apellidos: m.apellidos, nombres: m.nombres, actorId: sesion.usuarioId, actorNombre: sesion.nombre });
    await auditar(client, sesion, "mjrv", id, { en_lista: true });
    return true;
  });
}

export type ResultadoFuera = { ok: true; aviso: string } | { ok: false; mensaje: string };

// También se revoca a quien no consta. Si la cédula sí está activa, se revoca esa ficha.
export async function revocarFueraDeLista(sesion: Sesion, d: { cedula: string; apellidos: string; nombres: string }): Promise<ResultadoFuera> {
  const cedula = normalizarCedula(d.cedula);
  if (!CEDULA.test(cedula)) return { ok: false, mensaje: "La cédula no es válida (5 a 20 letras, números o guiones)." };
  const apellidos = d.apellidos.trim();
  const nombres = d.nombres.trim();
  if (!apellidos || !nombres) return { ok: false, mensaje: "Escriba apellidos y nombres." };
  if (apellidos.length > 120 || nombres.length > 120) return { ok: false, mensaje: "El nombre es demasiado largo." };
  return withTx(async (client) => {
    const m = (await client.query<{ id: number; activo: boolean; apellidos: string; nombres: string }>("SELECT id, activo, apellidos, nombres FROM mjrv WHERE cedula = $1 FOR UPDATE", [cedula])).rows[0];
    await guardar(client, { mjrvId: m?.id ?? null, cedula, apellidos: m ? m.apellidos : apellidos, nombres: m ? m.nombres : nombres, actorId: sesion.usuarioId, actorNombre: sesion.nombre });
    await auditar(client, sesion, m ? "mjrv" : "credenciales_revocadas", m?.id ?? cedula, { en_lista: !!m?.activo });
    return { ok: true as const, aviso: m?.activo ? "Está en la lista. Se revocó su acceso." : "Acceso revocado." };
  });
}

// La lectura de la puerta: cédula guardada, cédula actual de la ficha, o el nombre impreso.
export async function credencialRevocada(client: PoolClient, codigos: string[], clave: string): Promise<{ mjrvId: number | null } | null> {
  const r = await client.query<{ mjrv_id: number | null }>(
    `SELECT r.mjrv_id FROM credenciales_revocadas r
      WHERE r.cedula = ANY($1::text[])
         OR EXISTS (SELECT 1 FROM mjrv m WHERE m.id = r.mjrv_id AND m.cedula = ANY($1::text[]))
         OR ($2 <> '' AND $2 = ANY(r.claves))
      LIMIT 1`,
    [codigos, clave],
  );
  return r.rows[0] ? { mjrvId: r.rows[0].mjrv_id } : null;
}

export async function mjrvRevocado(client: PoolClient, mjrvId: number): Promise<boolean> {
  const r = await client.query(
    `SELECT 1 FROM credenciales_revocadas r JOIN mjrv m ON m.id = $1 WHERE r.mjrv_id = m.id OR r.cedula = m.cedula`,
    [mjrvId],
  );
  return !!r.rows[0];
}
