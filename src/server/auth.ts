import { sha256Bytes, sha256Hex } from "../domain/text";
import { esRolAdmin, type RolAdmin } from "../domain/roles";
import { passwordProblem } from "../domain/password-policy";
import { randomToken } from "./crypto";
import { query } from "./db";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "./passwords";

export type PortalSesion = "admin" | "superadmin";
const TIPO_DE_PORTAL: Record<PortalSesion, string> = { admin: "madrid_admin", superadmin: "superadmin" };
const HORAS_SESION = 16;
export const GENERICO = "Correo o contraseña incorrectos.";

export type Sesion = {
  sesionId: string;
  usuarioId: number;
  correo: string;
  nombre: string;
  tipo: string;
  rol: RolAdmin; // solo significa algo en el portal admin; la superadmin lo ignora
  debeCambiar: boolean;
  mfaVerificada: boolean;
};

export type ResultadoLogin = { ok: true; token: string; debeCambiar: boolean } | { ok: false; mensaje: string };

async function contarFallos(clave: string): Promise<number> {
  const f = await query<{ n: number }>("SELECT count(*)::int AS n FROM intentos_acceso WHERE clave = $1 AND NOT exito AND creado_en > now() - interval '15 minutes'", [clave]);
  return f[0]?.n ?? 0;
}
const anotar = (clave: string, exito: boolean) => query("INSERT INTO intentos_acceso (clave, exito) VALUES ($1, $2)", [clave, exito]);

export async function login(entrada: { correo: string; password: string; portal: PortalSesion; ip: string | null; agente: string | null }): Promise<ResultadoLogin> {
  const correo = entrada.correo.trim().toLowerCase();
  const claveCorreo = `correo:${sha256Hex(correo)}`;
  const claveIp = entrada.ip ? `ip:${entrada.ip}` : null;
  // Límites: 10 fallos por correo y 30 por IP en 15 minutos. El mensaje no dice cuál saltó.
  if (await bloqueado(claveCorreo, entrada.ip)) {
    await verifyPassword(DUMMY_PASSWORD_HASH, entrada.password);
    return { ok: false, mensaje: GENERICO };
  }
  const filas = await query<{ id: number; password_hash: string; activo: boolean; debe_cambiar: boolean }>(
    "SELECT id, password_hash, activo, debe_cambiar FROM usuarios WHERE correo = $1 AND tipo = $2",
    [correo, TIPO_DE_PORTAL[entrada.portal]],
  );
  const usuario = filas[0];
  const coincide = await verifyPassword(usuario?.password_hash ?? DUMMY_PASSWORD_HASH, entrada.password);
  if (!usuario || !usuario.activo || !coincide) {
    await anotar(claveCorreo, false);
    if (claveIp) await anotar(claveIp, false);
    return { ok: false, mensaje: GENERICO };
  }
  const token = await abrirSesion(usuario.id, entrada.portal, entrada.ip, entrada.agente);
  await anotar(claveCorreo, true);
  return { ok: true, token, debeCambiar: usuario.debe_cambiar };
}

async function abrirSesion(usuarioId: number, portal: PortalSesion, ip: string | null, agente: string | null): Promise<string> {
  const token = randomToken();
  await query(
    `INSERT INTO sesiones (token_hash, usuario_id, portal, expira_en, ip, agente)
     VALUES ($1, $2, $3, now() + make_interval(hours => $4), NULLIF($5,'')::inet, $6)`,
    [sha256Bytes(token), usuarioId, portal, HORAS_SESION, ip ?? "", (agente ?? "").slice(0, 300)],
  );
  await query("UPDATE usuarios SET ultimo_acceso_en = now() WHERE id = $1", [usuarioId]);
  return token;
}

async function bloqueado(claveCorreo: string, ip: string | null): Promise<boolean> {
  return (await contarFallos(claveCorreo)) >= 10 || (!!ip && (await contarFallos(`ip:${ip}`)) >= 30);
}

// ¿Esta cuenta de superadministración tiene la contraseña pendiente de definir? Solo responde sí si no está bloqueada por intentos.
export async function pideDefinirContrasena(correoCrudo: string, ip: string | null): Promise<boolean> {
  const correo = correoCrudo.trim().toLowerCase();
  if (await bloqueado(`correo:${sha256Hex(correo)}`, ip)) return false;
  const f = await query("SELECT 1 FROM usuarios WHERE correo = $1 AND tipo = 'superadmin' AND activo AND password_pendiente AND password_hash IS NULL AND mfa_activada_en IS NULL", [correo]);
  return f.length > 0;
}

// Primer acceso de la superadmin: define su contraseña (una sola vez) y abre sesión; la 2FA sigue siendo obligatoria.
export async function definirContrasenaInicial(entrada: { correo: string; nueva: string; repetir: string; ip: string | null; agente: string | null }): Promise<ResultadoLogin> {
  const correo = entrada.correo.trim().toLowerCase();
  const claveCorreo = `correo:${sha256Hex(correo)}`;
  const claveIp = entrada.ip ? `ip:${entrada.ip}` : null;
  const fallar = async (mensaje: string): Promise<ResultadoLogin> => {
    await anotar(claveCorreo, false);
    if (claveIp) await anotar(claveIp, false);
    return { ok: false, mensaje };
  };
  if (await bloqueado(claveCorreo, entrada.ip)) return { ok: false, mensaje: GENERICO };
  if (entrada.nueva !== entrada.repetir) return fallar("Las dos contraseñas no coinciden.");
  const problema = passwordProblem(entrada.nueva, correo);
  if (problema) return fallar(problema);
  // La condición va en el UPDATE: si dos personas llegan a la vez, solo una gana.
  const f = await query<{ id: number }>(
    `UPDATE usuarios SET password_hash = $1, password_pendiente = false, debe_cambiar = false
      WHERE correo = $2 AND tipo = 'superadmin' AND activo AND password_pendiente AND password_hash IS NULL AND mfa_activada_en IS NULL RETURNING id`,
    [await hashPassword(entrada.nueva), correo],
  );
  if (!f[0]) return fallar(GENERICO);
  const token = await abrirSesion(f[0].id, "superadmin", entrada.ip, entrada.agente);
  await anotar(claveCorreo, true);
  return { ok: true, token, debeCambiar: false };
}

// Una cookie solo vale en el portal que la creó: se comprueba portal de la sesión y tipo del usuario.
export async function leerSesion(token: string | undefined, portal: PortalSesion): Promise<Sesion | null> {
  if (!token) return null;
  const f = await query<{ id: string; usuario_id: number; correo: string; nombre: string; tipo: string; rol: string; debe_cambiar: boolean; mfa_verificada: boolean }>(
    `SELECT s.id, u.id AS usuario_id, u.correo, u.nombre, u.tipo, u.rol, u.debe_cambiar, s.mfa_verificada
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = $1 AND s.portal = $2 AND u.tipo = $3 AND u.activo
        AND s.revocada_en IS NULL AND s.expira_en > now()`,
    [sha256Bytes(token), portal, TIPO_DE_PORTAL[portal]],
  );
  const r = f[0];
  return r ? { sesionId: r.id, usuarioId: r.usuario_id, correo: r.correo, nombre: r.nombre, tipo: r.tipo, rol: esRolAdmin(r.rol) ? r.rol : "consul", debeCambiar: r.debe_cambiar, mfaVerificada: r.mfa_verificada } : null;
}

export async function cerrarSesion(token: string | undefined): Promise<void> {
  if (token) await query("UPDATE sesiones SET revocada_en = now() WHERE token_hash = $1 AND revocada_en IS NULL", [sha256Bytes(token)]);
}

export async function cambiarContrasena(token: string | undefined, portal: PortalSesion, actual: string, nueva: string): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const sesion = await leerSesion(token, portal);
  if (!sesion) return { ok: false, mensaje: "La sesión ya no es válida." };
  const f = await query<{ password_hash: string }>("SELECT password_hash FROM usuarios WHERE id = $1", [sesion.usuarioId]);
  if (!(await verifyPassword(f[0].password_hash, actual))) return { ok: false, mensaje: "La contraseña actual no coincide." };
  const problema = passwordProblem(nueva, sesion.correo);
  if (problema) return { ok: false, mensaje: problema };
  if (nueva === actual) return { ok: false, mensaje: "La nueva contraseña debe ser distinta de la actual." };
  await query("UPDATE usuarios SET password_hash = $1, debe_cambiar = false WHERE id = $2", [await hashPassword(nueva), sesion.usuarioId]);
  // Las demás sesiones de la cuenta dejan de valer.
  await query("UPDATE sesiones SET revocada_en = now() WHERE usuario_id = $1 AND id <> $2 AND revocada_en IS NULL", [sesion.usuarioId, sesion.sesionId]);
  return { ok: true };
}
