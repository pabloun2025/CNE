import { parsePhoneNumberFromString } from "libphonenumber-js";
import { textoCambio } from "../domain/pago";
import { leerJunta } from "../domain/juntas";
import { rolDeCargo, type Rol } from "../domain/importacion/mjrv";
import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { query, withTx } from "./db";

export type FiltrosMjrv = { junta?: string; rol?: string; estado?: string; q?: string };
export type FilaLista = {
  id: number; cedula: string; apellidos: string; nombres: string; rol: Rol; cargo_original: string; activo: boolean; es_prueba: boolean;
  origen: string; vigente: string; ingresado: boolean;
};

const ROLES = ["presidente", "secretario", "vocal", "suplente", "otro"];
const SQL_VIGENTE = `coalesce((SELECT d.junta_destino_id FROM decisiones_movimiento d WHERE d.mjrv_id = m.id AND d.decision = 'aceptada' ORDER BY d.creado_en DESC, d.id DESC LIMIT 1), m.junta_origen_id)`;

export async function listarMjrv(f: FiltrosMjrv): Promise<FilaLista[]> {
  const where: string[] = [];
  const p: unknown[] = [];
  const j = f.junta ? leerJunta(f.junta) : null;
  if (j) { p.push(j.serie, j.numero); where.push(`jo.serie = $${p.length - 1} AND jo.numero = $${p.length}`); }
  if (f.rol && ROLES.includes(f.rol)) { p.push(f.rol); where.push(`m.rol = $${p.length}`); }
  if (f.estado === "baja") where.push("NOT m.activo");
  else if (f.estado === "ingresado") where.push("m.activo AND EXISTS (SELECT 1 FROM lecturas_puerta l WHERE l.mjrv_id = m.id AND l.resultado = 'valido')");
  else if (f.estado === "no_ingresado") where.push("m.activo AND NOT EXISTS (SELECT 1 FROM lecturas_puerta l WHERE l.mjrv_id = m.id AND l.resultado = 'valido')");
  else if (f.estado !== "todos") where.push("m.activo");
  const q = f.q?.trim();
  if (q) {
    p.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`);
    where.push(`(m.apellidos ILIKE $${p.length} OR m.nombres ILIKE $${p.length} OR m.cedula ILIKE $${p.length})`);
  }
  return query<FilaLista>(
    `SELECT m.id, m.cedula, m.apellidos, m.nombres, m.rol, m.cargo_original, m.activo, m.es_prueba,
            jo.serie || jo.numero AS origen, jv.serie || jv.numero AS vigente,
            EXISTS (SELECT 1 FROM lecturas_puerta l WHERE l.mjrv_id = m.id AND l.resultado = 'valido') AS ingresado
       FROM mjrv m JOIN juntas_madrid jo ON jo.id = m.junta_origen_id JOIN juntas_madrid jv ON jv.id = ${SQL_VIGENTE}
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY jo.serie, jo.numero, m.apellidos LIMIT 500`,
    p,
  );
}

export type Ficha = {
  id: number; cedula: string; apellidos: string; nombres: string; cargo_original: string; rol: Rol; rotulo_credencial: string | null;
  correo: string | null; telefono_e164: string | null; activo: boolean; baja_motivo: string | null; es_prueba: boolean;
  credencial_generada_en: string | null; fuente_archivo: string | null; origen: string; vigente: string;
  ingreso_en: string | null; incorporado_en: string | null; incorporado_por: string | null; anverso: boolean; reverso: boolean; actas: number; pago: { en: string; importe_usd: string | null; tipo_cambio: string | null; operador: string } | null;
  movimientos: { creado_en: string; origen: string; destino: string; decision: string; manual: boolean; actor_nombre: string }[];
};

export async function obtenerFicha(id: number): Promise<Ficha | null> {
  const f = await query<Omit<Ficha, "movimientos" | "pago" | "actas" | "anverso" | "reverso">>(
    `SELECT m.id, m.cedula, m.apellidos, m.nombres, m.cargo_original, m.rol, m.rotulo_credencial, m.correo, m.telefono_e164, m.activo, m.baja_motivo, m.es_prueba,
            m.credencial_generada_en::text, m.fuente_archivo, jo.serie || jo.numero AS origen, jv.serie || jv.numero AS vigente,
            (SELECT min(l.creado_en)::text FROM lecturas_puerta l WHERE l.mjrv_id = m.id AND l.resultado = 'valido') AS ingreso_en,
            m.incorporado_en::text, m.incorporado_por
       FROM mjrv m JOIN juntas_madrid jo ON jo.id = m.junta_origen_id JOIN juntas_madrid jv ON jv.id = ${SQL_VIGENTE}
      WHERE m.id = $1`, [id]);
  if (!f[0]) return null;
  const docs = await query<{ lado: string }>("SELECT lado FROM documentos_mjrv WHERE mjrv_id = $1", [id]);
  const actas = await query<{ n: number }>("SELECT count(*)::int AS n FROM actas_pago WHERE mjrv_id = $1", [id]);
  const pago = await query<{ en: string; importe_usd: string | null; tipo_cambio: string | null; operador: string }>(
    "SELECT p.confirmado_en::text AS en, p.importe_usd::text, p.tipo_cambio::text, btrim(o.nombre || ' ' || o.apellido) AS operador FROM pagos_confirmados p JOIN operadores_madrid o ON o.id = p.operador_id WHERE p.mjrv_id = $1", [id]);
  const movimientos = await query<Ficha["movimientos"][number]>(
    `SELECT d.creado_en::text, jo.serie || jo.numero AS origen, jd.serie || jd.numero AS destino, d.decision, d.manual, d.actor_nombre
       FROM decisiones_movimiento d JOIN juntas_madrid jo ON jo.id = d.junta_origen_id JOIN juntas_madrid jd ON jd.id = d.junta_destino_id
      WHERE d.mjrv_id = $1 ORDER BY d.creado_en DESC, d.id DESC`, [id]);
  const cobro = pago[0];
  return { ...f[0], anverso: docs.some((d) => d.lado === "anverso"), reverso: docs.some((d) => d.lado === "reverso"), actas: actas[0].n, pago: cobro ? { ...cobro, tipo_cambio: cobro.tipo_cambio ? textoCambio(cobro.tipo_cambio) : null } : null, movimientos };
}

export type DatosMjrv = { cedula: string; apellidos: string; nombres: string; cargo: string; junta: string; correo: string; telefono: string; rotulo: string };
type Resultado = { ok: true; id: number } | { ok: false; mensaje: string };

function validar(d: DatosMjrv): { ok: true; cedula: string; apellidos: string; nombres: string; cargo: string; serie: string; numero: number; correo: string | null; telefono: string | null; rotulo: string | null } | { ok: false; mensaje: string } {
  const cedula = d.cedula.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[0-9A-Z-]{5,20}$/.test(cedula)) return { ok: false, mensaje: "La cédula no es válida (5 a 20 letras mayúsculas, números o guiones)." };
  const apellidos = d.apellidos.trim(), nombres = d.nombres.trim(), cargo = d.cargo.trim();
  if (!apellidos || !nombres) return { ok: false, mensaje: "Escriba apellidos y nombres." };
  if (!cargo) return { ok: false, mensaje: "Escriba el cargo." };
  const j = leerJunta(d.junta);
  if (!j) return { ok: false, mensaje: "La junta no existe: use H1–H41 o M1–M54." };
  const correo = d.correo.trim().toLowerCase() || null;
  if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { ok: false, mensaje: "El correo no es válido." };
  let telefono: string | null = null;
  if (d.telefono.trim()) {
    const p = parsePhoneNumberFromString(d.telefono.trim(), "ES");
    if (!p?.isValid()) return { ok: false, mensaje: "El teléfono no es válido (use el prefijo del país si no es español)." };
    telefono = p.number;
  }
  return { ok: true, cedula, apellidos, nombres, cargo, serie: j.serie, numero: j.numero, correo, telefono, rotulo: d.rotulo.trim() || null };
}

const esDuplicado = (e: unknown) => (e as { code?: string }).code === "23505";

export async function crearMjrv(sesion: Sesion, d: DatosMjrv): Promise<Resultado> {
  const v = validar(d);
  if (!v.ok) return v;
  try {
    return await withTx(async (client) => {
      const r = await client.query<{ id: number }>(
        `INSERT INTO mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, rotulo_credencial, correo, telefono_e164, fuente_archivo, es_prueba)
         VALUES ($1,$2,$3,$4,$5,(SELECT id FROM juntas_madrid WHERE serie = $6 AND numero = $7),$8,$9,$10,'Alta manual',false) RETURNING id`,
        [v.cedula, v.apellidos, v.nombres, v.cargo, rolDeCargo(v.cargo), v.serie, v.numero, v.rotulo, v.correo, v.telefono],
      );
      await registrarAuditoria({ portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "mjrv_creado", entidad: "mjrv", entidadId: r.rows[0].id }, client);
      return { ok: true as const, id: r.rows[0].id };
    });
  } catch (e) {
    if (esDuplicado(e)) return { ok: false, mensaje: "Ya existe una ficha con esa cédula." };
    throw e;
  }
}

export async function editarMjrv(sesion: Sesion, id: number, d: DatosMjrv): Promise<Resultado> {
  const v = validar(d);
  if (!v.ok) return v;
  try {
    return await withTx(async (client) => {
      const r = await client.query(
        `UPDATE mjrv SET cedula=$2, apellidos=$3, nombres=$4, cargo_original=$5, rol=$6, junta_origen_id=(SELECT id FROM juntas_madrid WHERE serie=$7 AND numero=$8),
                rotulo_credencial=$9, correo=$10, telefono_e164=$11, actualizado_en=now() WHERE id=$1 RETURNING id`,
        [id, v.cedula, v.apellidos, v.nombres, v.cargo, rolDeCargo(v.cargo), v.serie, v.numero, v.rotulo, v.correo, v.telefono],
      );
      if (!r.rows[0]) return { ok: false as const, mensaje: "La ficha no existe." };
      await registrarAuditoria({ portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "mjrv_editado", entidad: "mjrv", entidadId: id }, client);
      return { ok: true as const, id };
    });
  } catch (e) {
    if (esDuplicado(e)) return { ok: false, mensaje: "Ya existe otra ficha con esa cédula." };
    throw e;
  }
}

// La baja no borra historial: solo bloquea usos nuevos (la puerta responde «bloqueado»).
export async function cambiarBaja(sesion: Sesion, id: number, baja: boolean, motivo: string): Promise<void> {
  const r = await query("UPDATE mjrv SET activo = $2, baja_motivo = $3, actualizado_en = now() WHERE id = $1 RETURNING id", [id, !baja, baja ? motivo.trim().slice(0, 200) || "Baja administrativa" : null]);
  if (r[0]) await registrarAuditoria({ portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: baja ? "mjrv_baja" : "mjrv_reactivado", entidad: "mjrv", entidadId: id });
}
