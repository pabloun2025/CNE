import { cubrirCargos, type AsignacionCargo, type PersonaCargo } from "../domain/cargos";
import { resolverCargo, validarCedula as validarCedulaTexto, validarCorreo, validarMovil } from "../domain/ingreso";
import { leerJunta } from "../domain/juntas";
import type { Rol } from "../domain/importacion/mjrv";
import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { query, withTx } from "./db";
import { PERSONAS_CARGO } from "./mando";

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
  ingreso_en: string | null; incorporado_en: string | null; incorporado_por: string | null; anverso: boolean; reverso: boolean; actas: number; pago: { en: string; importe_usd: string | null; importe_eur: string | null; operador: string } | null;
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
  const pago = await query<{ en: string; importe_usd: string | null; importe_eur: string | null; operador: string }>(
    "SELECT p.confirmado_en::text AS en, p.importe_usd::text, p.importe_eur::text, coalesce(nullif(btrim(o.nombre || ' ' || o.apellido), ''), u.nombre) AS operador FROM pagos_confirmados p LEFT JOIN operadores_madrid o ON o.id = p.operador_id LEFT JOIN usuarios u ON u.id = p.usuario_id WHERE p.mjrv_id = $1", [id]);
  const movimientos = await query<Ficha["movimientos"][number]>(
    `SELECT d.creado_en::text, jo.serie || jo.numero AS origen, jd.serie || jd.numero AS destino, d.decision, d.manual, d.actor_nombre
       FROM decisiones_movimiento d JOIN juntas_madrid jo ON jo.id = d.junta_origen_id JOIN juntas_madrid jd ON jd.id = d.junta_destino_id
      WHERE d.mjrv_id = $1 ORDER BY d.creado_en DESC, d.id DESC`, [id]);
  const cobro = pago[0];
  return { ...f[0], anverso: docs.some((d) => d.lado === "anverso"), reverso: docs.some((d) => d.lado === "reverso"), actas: actas[0].n, pago: cobro ?? null, movimientos };
}

export type DatosMjrv = { cedula: string; apellidos: string; nombres: string; cargo: string; junta: string; correo: string; telefono: string; rotulo: string };
type Resultado = { ok: true; id: number } | { ok: false; mensaje: string };

function validar(d: DatosMjrv): { ok: true; cedula: string; apellidos: string; nombres: string; cargo: string; rol: Rol; serie: string; numero: number; correo: string | null; telefono: string | null; rotulo: string | null } | { ok: false; mensaje: string } {
  const cedula = validarCedulaTexto(d.cedula);
  if (!cedula.ok) return cedula;
  const apellidos = d.apellidos.trim(), nombres = d.nombres.trim();
  if (!apellidos || !nombres) return { ok: false, mensaje: "Escriba apellidos y nombres." };
  const cargo = resolverCargo(d.cargo);
  if (!cargo) return { ok: false, mensaje: "Elija el cargo." };
  const j = leerJunta(d.junta);
  if (!j) return { ok: false, mensaje: "La junta no existe: use H1–H41 o M1–M54." };
  const correo = validarCorreo(d.correo);
  if (!correo.ok) return correo;
  const telefono = validarMovil(d.telefono);
  if (!telefono.ok) return telefono;
  return { ok: true, cedula: cedula.cedula, apellidos, nombres, cargo: cargo.etiqueta, rol: cargo.rol, serie: j.serie, numero: j.numero, correo: correo.correo, telefono: telefono.telefono, rotulo: d.rotulo.trim() || null };
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
        [v.cedula, v.apellidos, v.nombres, v.cargo, v.rol, v.serie, v.numero, v.rotulo, v.correo, v.telefono],
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
        [id, v.cedula, v.apellidos, v.nombres, v.cargo, v.rol, v.serie, v.numero, v.rotulo, v.correo, v.telefono],
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

export type ActorFicha = { tipo: "usuario" | "operador"; id: number; nombre: string; portal: "admin" | "finanzas" };

const nombreLimpio = (t: string) => t.trim().replace(/\s+/g, " ");

// Solo apellidos y nombres: la cédula, el cargo y la junta no se tocan desde el pago.
export async function corregirNombres(actor: ActorFicha, id: number, apellidosBrutos: string, nombresBrutos: string): Promise<Resultado> {
  const apellidos = nombreLimpio(apellidosBrutos);
  const nombres = nombreLimpio(nombresBrutos);
  if (apellidos.length < 2 || apellidos.length > 120 || nombres.length < 2 || nombres.length > 120) {
    return { ok: false, mensaje: "Escriba apellidos y nombres (2 a 120 caracteres)." };
  }
  return withTx(async (client) => {
    const r = await client.query("UPDATE mjrv SET apellidos = $2, nombres = $3, actualizado_en = now() WHERE id = $1 RETURNING id", [id, apellidos, nombres]);
    if (!r.rows[0]) return { ok: false as const, mensaje: "La ficha no existe." };
    await registrarAuditoria({ portal: actor.portal, actorTipo: actor.tipo, actorId: actor.id, actorNombre: actor.nombre, accion: "mjrv_nombres", entidad: "mjrv", entidadId: id }, client);
    return { ok: true as const, id };
  });
}

// La cédula queda validada cuando el financiero comprobó las dos fotos. Sin fotos no hay nada que validar.
export async function validarCedula(actor: ActorFicha, id: number): Promise<Resultado> {
  const lados = (await query<{ lado: string }>("SELECT lado FROM documentos_mjrv WHERE mjrv_id = $1", [id])).map((x) => x.lado);
  if (!lados.includes("anverso") || !lados.includes("reverso")) return { ok: false, mensaje: "Faltan fotos de la cédula. No se puede validar." };
  return withTx(async (client) => {
    const r = await client.query("UPDATE mjrv SET cedula_validada_en = coalesce(cedula_validada_en, now()), actualizado_en = now() WHERE id = $1 RETURNING id", [id]);
    if (!r.rows[0]) return { ok: false as const, mensaje: "La ficha no existe." };
    await registrarAuditoria({ portal: actor.portal, actorTipo: actor.tipo, actorId: actor.id, actorNombre: actor.nombre, accion: "cedula_validada", entidad: "mjrv", entidadId: id }, client);
    return { ok: true as const, id };
  });
}

// La baja no borra historial: solo bloquea usos nuevos (la puerta responde «bloqueado»).
export async function cambiarBaja(sesion: Sesion, id: number, baja: boolean, motivo: string): Promise<void> {
  const r = await query("UPDATE mjrv SET activo = $2, baja_motivo = $3, actualizado_en = now() WHERE id = $1 RETURNING id", [id, !baja, baja ? motivo.trim().slice(0, 200) || "Baja administrativa" : null]);
  if (r[0]) await registrarAuditoria({ portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: baja ? "mjrv_baja" : "mjrv_reactivado", entidad: "mjrv", entidadId: id });
}

export type ResultadoBorrar = { ok: true } | { ok: false; mensaje: string; revocar?: boolean; anularJuntaId?: number };

type Cliente = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

// La junta está constituida si los tres cargos están cubiertos y esta persona cubre uno.
async function juntaConstituidaCon(client: Cliente, id: number): Promise<{ etiqueta: string; juntaId: number; asignacion: boolean } | null> {
  const v = (await client.query(
    `SELECT v.junta_actual_id, j.serie || j.numero AS etiqueta
       FROM v_mjrv_asignacion v JOIN juntas_madrid j ON j.id = v.junta_actual_id WHERE v.mjrv_id = $1`, [id])).rows[0] as { junta_actual_id: number; etiqueta: string } | undefined;
  if (!v) return null;
  const personas = (await client.query(`${PERSONAS_CARGO} WHERE v.junta_actual_id = $1 OR v.junta_origen_id = $1`, [v.junta_actual_id])).rows as PersonaCargo[];
  const asignaciones = (await client.query("SELECT mjrv_id, junta_id, cargo, origen FROM asignaciones_cargo WHERE junta_id = $1 AND activa", [v.junta_actual_id])).rows as AsignacionCargo[];
  const c = cubrirCargos([v.junta_actual_id], personas, asignaciones).get(v.junta_actual_id);
  if (!c || c.vacantes.length > 0 || !c.cargos.some((x) => x.mjrvId === id)) return null;
  return { etiqueta: v.etiqueta, juntaId: v.junta_actual_id, asignacion: asignaciones.some((a) => a.mjrv_id === id) };
}

const TABLAS_DE_LA_FICHA = ["fichas_abiertas_finanzas", "pendientes_impresion", "firmas_recibo", "envios_credencial", "excepciones_disponibilidad", "decisiones_movimiento", "documentos_mjrv", "actas_pago", "asignaciones_cargo", "lecturas_puerta"];

// El pago confirmado y la junta constituida no se tocan. Lo demás de esta ficha sí, para no dejar filas huérfanas.
export async function borrarMjrv(sesion: Sesion, id: number, confirmar: boolean): Promise<ResultadoBorrar> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, mensaje: "La ficha no existe." };
  if (!confirmar) return { ok: false, mensaje: "Confirme el borrado. No se borró nada." };
  try {
    return await withTx(async (client) => {
      if (!(await client.query("SELECT 1 FROM mjrv WHERE id = $1 FOR UPDATE", [id])).rows[0]) return { ok: false as const, mensaje: "La ficha no existe." };
      const pago = (await client.query("SELECT 1 FROM pagos_confirmados WHERE mjrv_id = $1", [id])).rows[0];
      const junta = await juntaConstituidaCon(client, id);
      if (pago || junta) {
        const partes = [
          pago ? "Ya se pagó. No se borra la ficha. Puede editarla o revocar la credencial." : "",
          junta ? `La junta ${junta.etiqueta} quedó constituida con esta persona. No se borra. Puede editar la ficha${junta.asignacion ? " o anular la asignación del cargo" : ""}.` : "",
        ].filter(Boolean);
        return { ok: false as const, mensaje: partes.join(" "), revocar: !!pago, anularJuntaId: junta?.asignacion ? junta.juntaId : undefined };
      }
      for (const tabla of TABLAS_DE_LA_FICHA) await client.query(`DELETE FROM ${tabla} WHERE mjrv_id = $1`, [id]);
      await client.query("DELETE FROM mjrv WHERE id = $1", [id]);
      await registrarAuditoria({ portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "mjrv_borrado", entidad: "mjrv", entidadId: id }, client);
      return { ok: true as const };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23503") return { ok: false, mensaje: "No se puede borrar: quedaría un pago o la junta en un estado imposible. Puede editar la ficha o revocar la credencial.", revocar: true };
    throw e;
  }
}
