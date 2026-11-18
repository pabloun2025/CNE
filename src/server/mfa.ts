import { generateRecoveryCodes, generateTotpSecret, recoveryCodeHash, verifyTotp } from "../domain/totp";
import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { decryptBuffer, encryptBuffer } from "./crypto";
import { query, withTx } from "./db";

export type MfaEstado = { correo: string; activada: boolean; pendiente: { secreto: string; codigos: string[] } | null };
export type MfaResultado = "ok" | "invalido" | "bloqueado";

const MAX_FALLOS = 5; // por cuenta en 15 minutos, repartidos entre todas sus sesiones

type Fila = { correo: string; mfa_secreto: Buffer | null; mfa_secreto_nonce: Buffer | null; mfa_pendiente: Buffer | null; mfa_pendiente_nonce: Buffer | null; mfa_activada_en: string | null; mfa_ultimo_contador: number | null };

const leerFila = async (usuarioId: number): Promise<Fila | undefined> =>
  (await query<Fila>("SELECT correo, mfa_secreto, mfa_secreto_nonce, mfa_pendiente, mfa_pendiente_nonce, mfa_activada_en::text, mfa_ultimo_contador FROM usuarios WHERE id = $1 AND tipo = 'superadmin'", [usuarioId]))[0];

export async function estadoMfa(sesion: Sesion): Promise<MfaEstado | null> {
  const f = await leerFila(sesion.usuarioId);
  if (!f) return null;
  const activada = !!f.mfa_activada_en;
  const pendiente = !activada && f.mfa_pendiente && f.mfa_pendiente_nonce ? (JSON.parse(decryptBuffer(f.mfa_pendiente, f.mfa_pendiente_nonce).toString("utf8")) as { secreto: string; codigos: string[] }) : null;
  return { correo: f.correo, activada, pendiente };
}

// Propone secreto y códigos de recuperación; quedan cifrados hasta que la persona demuestre que su aplicación genera códigos válidos.
export async function comenzarMfa(sesion: Sesion): Promise<void> {
  const cifrado = encryptBuffer(Buffer.from(JSON.stringify({ secreto: generateTotpSecret(), codigos: generateRecoveryCodes() }), "utf8"));
  await query("UPDATE usuarios SET mfa_pendiente = $1, mfa_pendiente_nonce = $2 WHERE id = $3 AND tipo = 'superadmin' AND mfa_activada_en IS NULL", [cifrado.ciphertext, cifrado.nonce, sesion.usuarioId]);
}

async function fallosRecientes(usuarioId: number): Promise<number> {
  return (await query<{ n: number }>("SELECT count(*)::int AS n FROM intentos_acceso WHERE clave = $1 AND NOT exito AND creado_en > now() - interval '15 minutes'", [`mfa:${usuarioId}`]))[0].n;
}

// Un fallo se anota y, si se alcanza el tope, se cierran las sesiones de la cuenta (hay que volver a escribir la contraseña).
async function fallar(sesion: Sesion): Promise<MfaResultado> {
  await query("INSERT INTO intentos_acceso (clave, exito) VALUES ($1, false)", [`mfa:${sesion.usuarioId}`]);
  await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "mfa_fallida" });
  if ((await fallosRecientes(sesion.usuarioId)) >= MAX_FALLOS) {
    await query("UPDATE sesiones SET revocada_en = now() WHERE usuario_id = $1 AND revocada_en IS NULL", [sesion.usuarioId]);
    return "bloqueado";
  }
  return "invalido";
}

const marcarSesion = (client: { query: (s: string, p: unknown[]) => Promise<unknown> }, sesion: Sesion) =>
  client.query("UPDATE sesiones SET mfa_verificada = true WHERE id = $1", [sesion.sesionId]);

export async function completarMfa(sesion: Sesion, codigo: string, ahora = new Date()): Promise<MfaResultado> {
  if ((await fallosRecientes(sesion.usuarioId)) >= MAX_FALLOS) return "bloqueado";
  const estado = await estadoMfa(sesion);
  if (!estado?.pendiente) return "invalido";
  const contador = verifyTotp(estado.pendiente.secreto, codigo, ahora, null);
  if (contador === null) return fallar(sesion);
  const secreto = encryptBuffer(Buffer.from(estado.pendiente.secreto, "utf8"));
  await withTx(async (client) => {
    const r = await client.query(
      `UPDATE usuarios SET mfa_secreto = $1, mfa_secreto_nonce = $2, mfa_pendiente = NULL, mfa_pendiente_nonce = NULL,
              mfa_activada_en = now(), mfa_ultimo_contador = $3
        WHERE id = $4 AND mfa_activada_en IS NULL`,
      [secreto.ciphertext, secreto.nonce, contador, sesion.usuarioId],
    );
    if (r.rowCount !== 1) throw new Error("La verificación en dos pasos ya estaba activada.");
    for (const c of estado.pendiente!.codigos) await client.query("INSERT INTO codigos_recuperacion (usuario_id, codigo_hash) VALUES ($1, $2) ON CONFLICT DO NOTHING", [sesion.usuarioId, recoveryCodeHash(c)]);
    await marcarSesion(client, sesion);
    await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "mfa_activada" }, client);
  });
  return "ok";
}

export async function verificarMfa(sesion: Sesion, codigo: string, ahora = new Date()): Promise<MfaResultado> {
  if ((await fallosRecientes(sesion.usuarioId)) >= MAX_FALLOS) return "bloqueado";
  const f = await leerFila(sesion.usuarioId);
  if (!f?.mfa_activada_en || !f.mfa_secreto || !f.mfa_secreto_nonce) return "invalido";
  const secreto = decryptBuffer(f.mfa_secreto, f.mfa_secreto_nonce).toString("utf8");
  const contador = verifyTotp(secreto, codigo, ahora, f.mfa_ultimo_contador === null ? null : Number(f.mfa_ultimo_contador));
  if (contador === null) return fallar(sesion);
  return withTx(async (client) => {
    // La condición en el UPDATE hace atómico el «un código, un uso» aunque lleguen dos peticiones a la vez.
    const r = await client.query("UPDATE usuarios SET mfa_ultimo_contador = $1 WHERE id = $2 AND (mfa_ultimo_contador IS NULL OR mfa_ultimo_contador < $1)", [contador, sesion.usuarioId]);
    if (r.rowCount !== 1) return "invalido" as const;
    await marcarSesion(client, sesion);
    await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "mfa_verificada" }, client);
    return "ok" as const;
  });
}

export async function usarCodigoRecuperacion(sesion: Sesion, codigo: string): Promise<MfaResultado> {
  if ((await fallosRecientes(sesion.usuarioId)) >= MAX_FALLOS) return "bloqueado";
  return withTx(async (client) => {
    const r = await client.query("UPDATE codigos_recuperacion SET usado_en = now() WHERE usuario_id = $1 AND codigo_hash = $2 AND usado_en IS NULL", [sesion.usuarioId, recoveryCodeHash(codigo)]);
    if (r.rowCount !== 1) return null;
    await marcarSesion(client, sesion);
    await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "mfa_recuperacion_usada" }, client);
    return "ok" as const;
  }).then((r) => r ?? fallar(sesion));
}
