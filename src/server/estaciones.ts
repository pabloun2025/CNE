import { FUNCIONES, MAX_FALLOS_ENLACE, MAX_FALLOS_OPERADOR, MINUTOS_BLOQUEO, PIN_VALIDO, type Funcion } from "../domain/estaciones";
import { sha256Bytes } from "../domain/text";
import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { decryptBuffer, encryptBuffer, randomToken } from "./crypto";
import { query } from "./db";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "./passwords";

const HORAS_SESION = 16;
const auditoriaAdmin = (s: Sesion) => ({ portal: "admin", actorTipo: "usuario" as const, actorId: s.usuarioId, actorNombre: s.nombre });

// ───────────── Administración de operadores y enlaces ─────────────
export type Operador = { id: number; nombre: string; apellido: string; funciones: Funcion[]; activo: boolean; bloqueado: boolean };

const limpio = (t: string) => t.trim().replace(/\s+/g, " ");

export async function listarOperadores(): Promise<Operador[]> {
  return query<Operador>("SELECT id, nombre, apellido, funciones, activo, (bloqueado_hasta IS NOT NULL AND bloqueado_hasta > now()) AS bloqueado FROM operadores_madrid ORDER BY activo DESC, lower(apellido), lower(nombre)");
}

function validarOperador(nombre: string, apellido: string, funciones: string[], pin: string): string | null {
  const n = limpio(nombre);
  const a = limpio(apellido);
  if (n.length < 2 || n.length > 80) return "Escriba el nombre (2 a 80 caracteres).";
  if (a.length < 2 || a.length > 80) return "Escriba el apellido (2 a 80 caracteres).";
  if (funciones.length === 0 || !funciones.every((f) => (FUNCIONES as string[]).includes(f))) return "Elija al menos una función.";
  if (!PIN_VALIDO(pin)) return "El PIN debe tener exactamente 4 dígitos.";
  return null;
}

export async function crearOperador(sesion: Sesion, nombre: string, apellido: string, funciones: string[], pin: string): Promise<{ ok: true; id: number } | { ok: false; mensaje: string }> {
  const problema = validarOperador(nombre, apellido, funciones, pin);
  if (problema) return { ok: false, mensaje: problema };
  try {
    const f = await query<{ id: number }>("INSERT INTO operadores_madrid (nombre, apellido, pin_hash, funciones, creado_por) VALUES ($1,$2,$3,$4,$5) RETURNING id", [limpio(nombre), limpio(apellido), await hashPassword(pin), funciones, sesion.usuarioId]);
    await registrarAuditoria({ ...auditoriaAdmin(sesion), accion: "operador_creado", entidad: "operadores_madrid", entidadId: f[0].id });
    return { ok: true, id: f[0].id };
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { ok: false, mensaje: "Ya hay un operador activo con ese nombre y apellido." };
    throw e;
  }
}

async function revocarSesionesOperador(id: number) {
  await query("UPDATE sesiones_estacion SET revocada_en = now() WHERE operador_id = $1 AND revocada_en IS NULL", [id]);
}

export async function restablecerPin(sesion: Sesion, id: number, pin: string): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  if (!PIN_VALIDO(pin)) return { ok: false, mensaje: "El PIN debe tener exactamente 4 dígitos." };
  await query("UPDATE operadores_madrid SET pin_hash = $2, fallos = 0, bloqueado_hasta = NULL WHERE id = $1", [id, await hashPassword(pin)]);
  await revocarSesionesOperador(id);
  await registrarAuditoria({ ...auditoriaAdmin(sesion), accion: "pin_restablecido", entidad: "operadores_madrid", entidadId: id });
  return { ok: true };
}

export async function activarOperador(sesion: Sesion, id: number, activo: boolean): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  try {
    await query("UPDATE operadores_madrid SET activo = $2 WHERE id = $1", [id, activo]);
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { ok: false, mensaje: "Ya hay otro operador activo con ese nombre y apellido." };
    throw e;
  }
  if (!activo) await revocarSesionesOperador(id);
  await registrarAuditoria({ ...auditoriaAdmin(sesion), accion: activo ? "operador_reactivado" : "operador_desactivado", entidad: "operadores_madrid", entidadId: id });
  return { ok: true };
}

export type Enlace = { id: number; funcion: Funcion; etiqueta: string; activo: boolean; creado_en: string; token: string | null };

export async function crearEnlace(sesion: Sesion, funcion: string, etiqueta: string): Promise<{ ok: true; id: number; token: string } | { ok: false; mensaje: string }> {
  if (!(FUNCIONES as string[]).includes(funcion)) return { ok: false, mensaje: "Elija una función." };
  const e = etiqueta.trim();
  if (e.length < 2 || e.length > 60) return { ok: false, mensaje: "Escriba una etiqueta (por ejemplo «Puerta 1»)." };
  // Token de 32 bytes: solo se guarda su hash y una copia cifrada para volver a mostrar el QR.
  const token = randomToken(32);
  const { ciphertext, nonce } = encryptBuffer(Buffer.from(token));
  const f = await query<{ id: number }>("INSERT INTO enlaces_estacion (funcion, etiqueta, token_hash, token_cifrado, token_nonce, creado_por) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id", [funcion, e, sha256Bytes(token), ciphertext, nonce, sesion.usuarioId]);
  await registrarAuditoria({ ...auditoriaAdmin(sesion), accion: "enlace_creado", entidad: "enlaces_estacion", entidadId: f[0].id, datos: { funcion } });
  return { ok: true, id: f[0].id, token };
}

export async function listarEnlaces(): Promise<Enlace[]> {
  const f = await query<Omit<Enlace, "token"> & { token_cifrado: Buffer | null; token_nonce: Buffer | null }>("SELECT id, funcion, etiqueta, activo, creado_en::text, token_cifrado, token_nonce FROM enlaces_estacion ORDER BY activo DESC, id DESC");
  return f.map(({ token_cifrado, token_nonce, ...e }) => ({ ...e, token: e.activo && token_cifrado && token_nonce ? decryptBuffer(token_cifrado, token_nonce).toString() : null }));
}

export async function revocarEnlace(sesion: Sesion, id: number): Promise<void> {
  await query("UPDATE enlaces_estacion SET activo = false, revocado_en = now() WHERE id = $1 AND activo", [id]);
  await query("UPDATE sesiones_estacion SET revocada_en = now() WHERE enlace_id = $1 AND revocada_en IS NULL", [id]);
  await registrarAuditoria({ ...auditoriaAdmin(sesion), accion: "enlace_revocado", entidad: "enlaces_estacion", entidadId: id });
}

// ───────────── Acceso de la estación (nombre + PIN) ─────────────
export type EnlaceActivo = { id: number; funcion: Funcion; etiqueta: string };

export async function enlacePorToken(token: string): Promise<EnlaceActivo | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const f = await query<EnlaceActivo>("SELECT id, funcion, etiqueta FROM enlaces_estacion WHERE token_hash = $1 AND activo AND revocado_en IS NULL", [sha256Bytes(token)]);
  return f[0] ?? null;
}

export async function operadoresDelEnlace(enlace: EnlaceActivo): Promise<{ id: number; nombre: string; apellido: string }[]> {
  return query<{ id: number; nombre: string; apellido: string }>("SELECT id, nombre, apellido FROM operadores_madrid WHERE activo AND $1 = ANY(funciones) ORDER BY lower(apellido), lower(nombre)", [enlace.funcion]);
}

// La puerta no elige de una lista: escribe nombre, apellido y PIN, y se contrastan con los operadores cargados.
export async function identificarPuerta(token: string, nombreBruto: string, apellidoBruto: string, pin: string, dispositivo: string | null): Promise<ResultadoEstacion> {
  const enlace = await enlacePorToken(token);
  if (!enlace || enlace.funcion !== "puerta") return { ok: false, codigo: "enlace_inactivo", mensaje: "Este enlace ya no está activo. Pida uno nuevo a la administración." };
  const clave = `enlace:${enlace.id}`;
  const fallosEnlace = (await query<{ n: number }>("SELECT count(*)::int AS n FROM intentos_acceso WHERE clave = $1 AND NOT exito AND creado_en > now() - make_interval(mins => $2)", [clave, MINUTOS_BLOQUEO]))[0].n;
  if (fallosEnlace >= MAX_FALLOS_ENLACE) return { ok: false, codigo: "bloqueado", mensaje: `Demasiados intentos en este enlace. Espere ${MINUTOS_BLOQUEO} minutos.` };
  const nombre = limpio(nombreBruto);
  const apellido = limpio(apellidoBruto);
  if (nombre.length < 2 || apellido.length < 2) return { ok: false, codigo: "pin", mensaje: "Escriba su nombre y su apellido." };
  const ops = await query<{ id: number }>(
    "SELECT id FROM operadores_madrid WHERE activo AND 'puerta' = ANY(funciones) AND lower(nombre) = lower($1) AND lower(apellido) = lower($2)",
    [nombre, apellido]);
  if (ops.length !== 1) {
    await query("INSERT INTO intentos_acceso (clave, exito) VALUES ($1, false)", [clave]);
    return { ok: false, codigo: "pin", mensaje: "No se pudo identificar. Revise el nombre, el apellido y el PIN." };
  }
  return identificarEstacion(token, ops[0].id, pin, dispositivo);
}

export type ResultadoEstacion = { ok: true; sesionToken: string } | { ok: false; codigo: "enlace_inactivo" | "bloqueado" | "pin"; mensaje: string };

export async function identificarEstacion(token: string, operadorId: number, pin: string, dispositivo: string | null): Promise<ResultadoEstacion> {
  const enlace = await enlacePorToken(token);
  if (!enlace) return { ok: false, codigo: "enlace_inactivo", mensaje: "Este enlace ya no está activo. Pida uno nuevo a la administración." };
  const clave = `enlace:${enlace.id}`;
  const fallosEnlace = (await query<{ n: number }>("SELECT count(*)::int AS n FROM intentos_acceso WHERE clave = $1 AND NOT exito AND creado_en > now() - make_interval(mins => $2)", [clave, MINUTOS_BLOQUEO]))[0].n;
  if (fallosEnlace >= MAX_FALLOS_ENLACE) return { ok: false, codigo: "bloqueado", mensaje: `Demasiados intentos en este enlace. Espere ${MINUTOS_BLOQUEO} minutos.` };

  const op = (await query<{ id: number; pin_hash: string; fallos: number; bloqueado: boolean }>(
    "SELECT id, pin_hash, fallos, (bloqueado_hasta IS NOT NULL AND bloqueado_hasta > now()) AS bloqueado FROM operadores_madrid WHERE id = $1 AND activo AND $2 = ANY(funciones)", [operadorId, enlace.funcion]))[0];
  if (op?.bloqueado) return { ok: false, codigo: "bloqueado", mensaje: `Este operador está bloqueado. Espere ${MINUTOS_BLOQUEO} minutos o pida a la administración que restablezca el PIN.` };
  const coincide = await verifyPassword(op?.pin_hash ?? DUMMY_PASSWORD_HASH, PIN_VALIDO(pin) ? pin : "x");
  if (!op || !coincide) {
    await query("INSERT INTO intentos_acceso (clave, exito) VALUES ($1, false)", [clave]);
    if (!op) return { ok: false, codigo: "pin", mensaje: "No se pudo identificar. Elija su nombre de la lista." };
    const fallos = op.fallos + 1;
    if (fallos >= MAX_FALLOS_OPERADOR) {
      await query("UPDATE operadores_madrid SET fallos = 0, bloqueado_hasta = now() + make_interval(mins => $2) WHERE id = $1", [op.id, MINUTOS_BLOQUEO]);
      await registrarAuditoria({ portal: "estacion", actorTipo: "operador", actorId: op.id, accion: "operador_bloqueado", entidad: "enlaces_estacion", entidadId: enlace.id });
      return { ok: false, codigo: "bloqueado", mensaje: `PIN incorrecto. Operador bloqueado ${MINUTOS_BLOQUEO} minutos.` };
    }
    await query("UPDATE operadores_madrid SET fallos = $2 WHERE id = $1", [op.id, fallos]);
    const quedan = MAX_FALLOS_OPERADOR - fallos;
    return { ok: false, codigo: "pin", mensaje: `PIN incorrecto. Le quedan ${quedan} ${quedan === 1 ? "intento" : "intentos"}.` };
  }
  await query("UPDATE operadores_madrid SET fallos = 0, bloqueado_hasta = NULL WHERE id = $1", [op.id]);
  const sesionToken = randomToken(32);
  await query("INSERT INTO sesiones_estacion (token_hash, enlace_id, operador_id, dispositivo, expira_en) VALUES ($1,$2,$3,$4, now() + make_interval(hours => $5))", [sha256Bytes(sesionToken), enlace.id, op.id, (dispositivo ?? "").slice(0, 300), HORAS_SESION]);
  await registrarAuditoria({ portal: "estacion", actorTipo: "operador", actorId: op.id, accion: "estacion_acceso", entidad: "enlaces_estacion", entidadId: enlace.id });
  return { ok: true, sesionToken };
}

export type SesionEstacion = { sesionId: string; enlaceId: number; funcion: Funcion; etiqueta: string; operadorId: number; operadorNombre: string };

// En cada petición se vuelve a comprobar que enlace y operador siguen activos (revocar vale al instante).
export async function leerSesionEstacion(token: string | undefined): Promise<SesionEstacion | null> {
  if (!token) return null;
  const f = await query<{ sesion_id: string; enlace_id: number; funcion: Funcion; etiqueta: string; operador_id: number; nombre: string }>(
    `SELECT s.id AS sesion_id, e.id AS enlace_id, e.funcion, e.etiqueta, o.id AS operador_id, btrim(o.nombre || ' ' || o.apellido) AS nombre
       FROM sesiones_estacion s JOIN enlaces_estacion e ON e.id = s.enlace_id JOIN operadores_madrid o ON o.id = s.operador_id
      WHERE s.token_hash = $1 AND s.revocada_en IS NULL AND s.expira_en > now()
        AND e.activo AND e.revocado_en IS NULL AND o.activo AND e.funcion = ANY(o.funciones)`, [sha256Bytes(token)]);
  const r = f[0];
  return r ? { sesionId: r.sesion_id, enlaceId: r.enlace_id, funcion: r.funcion, etiqueta: r.etiqueta, operadorId: r.operador_id, operadorNombre: r.nombre } : null;
}

export type ValidacionEstacion = { ok: true; sesion: SesionEstacion } | { ok: false; status: 401 | 403 };

// 401 sin sesión válida; 403 si la función del enlace no está entre las permitidas.
export async function validarEstacion(token: string | undefined, funciones: Funcion[]): Promise<ValidacionEstacion> {
  const sesion = await leerSesionEstacion(token);
  if (!sesion) return { ok: false, status: 401 };
  if (!funciones.includes(sesion.funcion)) return { ok: false, status: 403 };
  return { ok: true, sesion };
}

export async function cerrarSesionEstacion(token: string | undefined): Promise<void> {
  if (token) await query("UPDATE sesiones_estacion SET revocada_en = now() WHERE token_hash = $1 AND revocada_en IS NULL", [sha256Bytes(token)]);
}

