import { TIPOS_MADRID, type Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { randomToken } from "./crypto";
import { query, withTx } from "./db";
import { hashPassword } from "./passwords";
import { passwordProblem } from "../domain/password-policy";
import { esRolAdmin, ETIQUETA_ROL, type RolAdmin } from "../domain/roles";
import type { Modo } from "./config";

// Defensa en profundidad: aunque una acción se llamara sin la guarda, solo la superadmin pasa.
function exigirSuperadmin(sesion: Sesion): void {
  if (sesion.tipo !== "superadmin") throw new Error("Solo la superadministración puede hacer esto.");
}

const tipoCuenta = (rol: RolAdmin) => rol === "validador" ? "madrid_documentacion" : rol === "verificador_mesas" ? "madrid_mesas" : "madrid_admin";

export type CuentaAdmin = { id: number; correo: string; rol: RolAdmin; nombre: string; activo: boolean; debe_cambiar: boolean; ultimo_acceso_en: string | null };

export async function listarAdmins(sesion: Sesion): Promise<CuentaAdmin[]> {
  exigirSuperadmin(sesion);
  return query<CuentaAdmin>("SELECT id, correo, rol, nombre, activo, debe_cambiar, ultimo_acceso_en::text FROM usuarios WHERE tipo = ANY($1) ORDER BY correo", [TIPOS_MADRID]);
}

// La contraseña temporal del restablecimiento se genera aquí y se muestra una sola vez.
const temporal = () => randomToken(9);

// El identificador de acceso es un correo o un nombre de usuario (letras minúsculas, números, punto, guion).
const ES_CORREO = /^[^@\s]+@[^@\s]+$/;
const ES_USUARIO = /^[a-z0-9][a-z0-9._-]{2,39}$/;

// La superadmin escribe la contraseña inicial. No hay contraseña de fábrica ni cambio obligatorio.
export async function crearAdmin(sesion: Sesion, correo: string, nombre: string, rol: string, password: string, repetir: string): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  exigirSuperadmin(sesion);
  const c = correo.trim().toLowerCase();
  const n = nombre.trim();
  if (!((ES_CORREO.test(c) && c.length <= 200) || ES_USUARIO.test(c))) return { ok: false, mensaje: "Escriba un correo o un nombre de usuario válido." };
  if (!esRolAdmin(rol)) return { ok: false, mensaje: `Elija el rol: ${Object.values(ETIQUETA_ROL).join(", ")}.` };
  if (n.length < 2 || n.length > 120) return { ok: false, mensaje: "Escriba el nombre de la persona." };
  if (password !== repetir) return { ok: false, mensaje: "Las dos contraseñas no coinciden." };
  const problema = passwordProblem(password, c);
  if (problema) return { ok: false, mensaje: problema };
  const f = await query<{ id: number }>(
    "INSERT INTO usuarios (tipo, correo, nombre, password_hash, debe_cambiar, rol) VALUES ($5, $1, $2, $3, false, $4) ON CONFLICT (correo) DO NOTHING RETURNING id",
    [c, n, await hashPassword(password), rol, tipoCuenta(rol)],
  );
  if (!f[0]) return { ok: false, mensaje: "Ya existe una cuenta con ese correo o usuario." };
  await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "admin_creado", entidad: "usuarios", entidadId: f[0].id, datos: { rol } });
  return { ok: true };
}

export async function cambiarRolAdmin(sesion: Sesion, usuarioId: number, rol: string): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  exigirSuperadmin(sesion);
  if (!esRolAdmin(rol)) return { ok: false, mensaje: `Elija el rol: ${Object.values(ETIQUETA_ROL).join(", ")}.` };
  const antes = (await query<{ rol: string }>("SELECT rol FROM usuarios WHERE id = $1 AND tipo = ANY($2)", [usuarioId, TIPOS_MADRID]))[0];
  if (!antes) return { ok: false, mensaje: "La cuenta no existe." };
  if (antes.rol === rol) return { ok: true };
  await query("UPDATE usuarios SET rol = $1, tipo = $3 WHERE id = $2 AND tipo = ANY($4)", [rol, usuarioId, tipoCuenta(rol), TIPOS_MADRID]);
  await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "admin_rol_cambiado", entidad: "usuarios", entidadId: usuarioId, datos: { de: antes.rol, a: rol } });
  return { ok: true };
}

async function revocarSesiones(usuarioId: number) {
  await query("UPDATE sesiones SET revocada_en = now() WHERE usuario_id = $1 AND revocada_en IS NULL", [usuarioId]);
}

export async function restablecerAdmin(sesion: Sesion, usuarioId: number): Promise<{ ok: true; password: string } | { ok: false; mensaje: string }> {
  exigirSuperadmin(sesion);
  const password = temporal();
  const f = await query("UPDATE usuarios SET password_hash = $1, debe_cambiar = true WHERE id = $2 AND tipo = ANY($3) RETURNING id", [await hashPassword(password), usuarioId, TIPOS_MADRID]);
  if (!f[0]) return { ok: false, mensaje: "La cuenta no existe." };
  await revocarSesiones(usuarioId);
  await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "admin_restablecido", entidad: "usuarios", entidadId: usuarioId });
  return { ok: true, password };
}

export async function activarAdmin(sesion: Sesion, usuarioId: number, activo: boolean): Promise<void> {
  exigirSuperadmin(sesion);
  const f = await query("UPDATE usuarios SET activo = $1 WHERE id = $2 AND tipo = ANY($3) RETURNING id", [activo, usuarioId, TIPOS_MADRID]);
  if (!f[0]) return;
  if (!activo) await revocarSesiones(usuarioId);
  await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: activo ? "admin_reactivado" : "admin_desactivado", entidad: "usuarios", entidadId: usuarioId });
}

const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
export const FRASE_MODO: Record<Modo, string> = { prueba: "MODO PRUEBA", eleccion: "MODO ELECCION" };

// Conmutar es explícito: hay que escribir el nombre del modo de destino. Queda auditado.
export async function cambiarModo(sesion: Sesion, destino: Modo, confirmacion: string): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  exigirSuperadmin(sesion);
  if (normalizar(confirmacion) !== FRASE_MODO[destino]) return { ok: false, mensaje: `Escriba «${FRASE_MODO[destino]}» para confirmar.` };
  return withTx(async (client) => {
    const antes = (await client.query<{ modo: Modo }>("SELECT modo FROM configuracion WHERE id = 1 FOR UPDATE")).rows[0].modo;
    if (antes === destino) return { ok: false as const, mensaje: "El sistema ya está en ese modo." };
    await client.query("UPDATE configuracion SET modo = $1, actualizado_en = now(), actualizado_por = $2 WHERE id = 1", [destino, sesion.usuarioId]);
    await registrarAuditoria({ portal: "superadmin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "modo_cambiado", entidad: "configuracion", entidadId: 1, datos: { de: antes, a: destino } }, client);
    return { ok: true as const };
  });
}
