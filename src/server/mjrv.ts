import type { PoolClient } from "pg";
import { cubrirCargos, type AsignacionCargo, type PersonaCargo } from "../domain/cargos";
import { resolverCargo, validarCedula as validarCedulaTexto, validarCorreo, validarMovil } from "../domain/ingreso";
import { leerJuntaPublica } from "../domain/juntas";
import type { Rol } from "../domain/importacion/mjrv";
import type { Sesion } from "./auth";
import { registrarAuditoria } from "./auditoria";
import type { Modo } from "./config";
import { query, withTx } from "./db";
import { juntaPublicaSql } from "./junta-sql";
import { estadoDocumentos, versionDocumentos, type EstadoDocs } from "./documentos";
import { PERSONAS_CARGO } from "./mando";

export type FiltrosMjrv = { junta?: string; rol?: string; estado?: string; q?: string };
export type FilaLista = {
  id: number; cedula: string; apellidos: string; nombres: string; rol: Rol; cargo_original: string; activo: boolean; es_prueba: boolean;
  origen: string; vigente: string; ingresado: boolean; incorporada: boolean; rotulo_credencial: string | null;
};

const ROLES = ["presidente", "secretario", "vocal", "suplente", "otro"];
const SQL_VIGENTE = `coalesce((SELECT d.junta_destino_id FROM decisiones_movimiento d WHERE d.mjrv_id = m.id AND d.decision = 'aceptada' ORDER BY d.creado_en DESC, d.id DESC LIMIT 1), m.junta_origen_id)`;

export async function listarMjrv(f: FiltrosMjrv): Promise<FilaLista[]> {
  const where: string[] = [];
  const p: unknown[] = [];
  const j = leerJuntaPublica(f.junta ?? "");
  if (f.junta?.trim() && !j) return [];
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
    `SELECT m.id, m.cedula, m.apellidos, m.nombres, m.rol, m.cargo_original, m.activo, m.es_prueba, m.rotulo_credencial,
            ${juntaPublicaSql("jo")} AS origen, ${juntaPublicaSql("jv")} AS vigente, m.incorporado_en IS NOT NULL AS incorporada,
            EXISTS (SELECT 1 FROM lecturas_puerta l WHERE l.mjrv_id = m.id AND l.resultado = 'valido') AS ingresado
       FROM mjrv m JOIN juntas_madrid jo ON jo.id = m.junta_origen_id JOIN juntas_madrid jv ON jv.id = ${SQL_VIGENTE}
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY jo.serie, jo.numero, m.apellidos, m.id`,
    p,
  );
}

export type Ficha = EstadoDocs & {
  id: number; cedula: string; apellidos: string; nombres: string; cargo_original: string; rol: Rol; rotulo_credencial: string | null;
  correo: string | null; telefono_e164: string | null; activo: boolean; baja_motivo: string | null; es_prueba: boolean;
  credencial_generada_en: string | null; fuente_archivo: string | null; origen: string; vigente: string;
  ingreso_en: string | null; incorporado_en: string | null; incorporado_por: string | null; actas: number; pago: { en: string; importe_usd: string | null; importe_eur: string | null; operador: string } | null;
  movimientos: { creado_en: string; origen: string; destino: string; decision: string; manual: boolean; actor_nombre: string }[];
};

export async function obtenerFicha(id: number): Promise<Ficha | null> {
  const f = await query<Omit<Ficha, keyof EstadoDocs | "movimientos" | "pago" | "actas">>(
    `SELECT m.id, m.cedula, m.apellidos, m.nombres, m.cargo_original, m.rol, m.rotulo_credencial, m.correo, m.telefono_e164, m.activo, m.baja_motivo, m.es_prueba,
            m.credencial_generada_en::text, m.fuente_archivo, ${juntaPublicaSql("jo")} AS origen, ${juntaPublicaSql("jv")} AS vigente,
            (SELECT min(l.creado_en)::text FROM lecturas_puerta l WHERE l.mjrv_id = m.id AND l.resultado = 'valido') AS ingreso_en,
            m.incorporado_en::text, m.incorporado_por
       FROM mjrv m JOIN juntas_madrid jo ON jo.id = m.junta_origen_id JOIN juntas_madrid jv ON jv.id = ${SQL_VIGENTE}
      WHERE m.id = $1`, [id]);
  if (!f[0]) return null;
  const docs = await estadoDocumentos(id);
  const actas = await query<{ n: number }>("SELECT count(*)::int AS n FROM actas_pago WHERE mjrv_id = $1", [id]);
  const pago = await query<{ en: string; importe_usd: string | null; importe_eur: string | null; operador: string }>(
    "SELECT p.confirmado_en::text AS en, p.importe_usd::text, p.importe_eur::text, coalesce(nullif(btrim(o.nombre || ' ' || o.apellido), ''), u.nombre) AS operador FROM pagos_confirmados p LEFT JOIN operadores_madrid o ON o.id = p.operador_id LEFT JOIN usuarios u ON u.id = p.usuario_id WHERE p.mjrv_id = $1", [id]);
  const movimientos = await query<Ficha["movimientos"][number]>(
    `SELECT d.creado_en::text, ${juntaPublicaSql("jo")} AS origen, ${juntaPublicaSql("jd")} AS destino, d.decision, d.manual, d.actor_nombre
       FROM decisiones_movimiento d JOIN juntas_madrid jo ON jo.id = d.junta_origen_id JOIN juntas_madrid jd ON jd.id = d.junta_destino_id
      WHERE d.mjrv_id = $1 ORDER BY d.creado_en DESC, d.id DESC`, [id]);
  const cobro = pago[0];
  return { ...f[0], ...docs, actas: actas[0].n, pago: cobro ?? null, movimientos };
}

export type DatosMjrv = { cedula: string; apellidos: string; nombres: string; cargo: string; junta: string; correo: string; telefono: string };
type Resultado = { ok: true; id: number } | { ok: false; mensaje: string };

function validar(d: DatosMjrv, permiteConservarCargo = false) {
  const cedula = validarCedulaTexto(d.cedula);
  if (!cedula.ok) return cedula;
  const apellidos = d.apellidos.trim(), nombres = d.nombres.trim();
  if (!apellidos || !nombres) return { ok: false as const, mensaje: "Escriba apellidos y nombres." };
  const cargo = resolverCargo(d.cargo);
  // En edición, el valor vacío conserva el cargo guardado, incluso si procede de una importación.
  if (!cargo && !(permiteConservarCargo && d.cargo === "")) return { ok: false as const, mensaje: "Elija el cargo." };
  const j = leerJuntaPublica(d.junta);
  if (!j) return { ok: false as const, mensaje: "La junta no existe: use M1–M41 (masculino) o F1–F54 (femenino)." };
  const correo = validarCorreo(d.correo);
  if (!correo.ok) return correo;
  const telefono = validarMovil(d.telefono);
  if (!telefono.ok) return telefono;
  return { ok: true as const, cedula: cedula.cedula, apellidos, nombres, cargo, ...j, correo: correo.correo, telefono: telefono.telefono };
}

const esDuplicado = (e: unknown) => (e as { code?: string }).code === "23505";

export async function crearMjrv(sesion: Sesion, d: DatosMjrv): Promise<Resultado> {
  const v = validar(d);
  if (!v.ok) return v;
  try {
    return await withTx(async (client) => {
      const r = await client.query<{ id: number }>(
        `INSERT INTO mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, correo, telefono_e164, fuente_archivo, es_prueba)
         VALUES ($1,$2,$3,$4,$5,(SELECT id FROM juntas_madrid WHERE serie = $6 AND numero = $7),$8,$9,'Alta manual',false) RETURNING id`,
        [v.cedula, v.apellidos, v.nombres, v.cargo?.etiqueta, v.cargo?.rol, v.serie, v.numero, v.correo, v.telefono],
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
  const v = validar(d, true);
  if (!v.ok) return v;
  try {
    return await withTx(async (client) => {
      const r = await client.query(
        `UPDATE mjrv SET cedula=$2, apellidos=$3, nombres=$4, cargo_original=coalesce($5,cargo_original), rol=coalesce($6,rol),
                junta_origen_id=(SELECT id FROM juntas_madrid WHERE serie=$7 AND numero=$8),
                correo=$9, telefono_e164=$10, actualizado_en=now() WHERE id=$1 RETURNING id`,
        [id, v.cedula, v.apellidos, v.nombres, v.cargo?.etiqueta ?? null, v.cargo?.rol ?? null, v.serie, v.numero, v.correo, v.telefono],
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

// La validación corresponde a las fotos vigentes de ese modo.
export async function validarCedula(actor: ActorFicha, id: number, modoEsperado?: Modo, versionEsperada?: string): Promise<Resultado> {
  return withTx(async (client) => {
    const [{ modo }] = (await client.query<{ modo: Modo }>("SELECT modo FROM configuracion WHERE id = 1 FOR SHARE")).rows;
    if (modoEsperado && modo !== modoEsperado) return { ok: false as const, mensaje: "El modo cambió. Vuelva a abrir la ficha antes de validar." };
    if (!(await client.query("SELECT 1 FROM mjrv WHERE id = $1 AND activo AND (cne.en_prueba() OR NOT es_prueba) FOR UPDATE", [id])).rows[0]) {
      return { ok: false as const, mensaje: "La ficha no existe o está de baja." };
    }
    await client.query("SELECT 1 FROM documentos_mjrv WHERE mjrv_id = $1 AND es_prueba = cne.en_prueba() FOR SHARE", [id]);
    const documentos = await estadoDocumentos(id, client);
    if (!documentos.completos) return { ok: false as const, mensaje: "Faltan fotos del documento de identidad. No se puede validar." };
    if (versionEsperada !== undefined && await versionDocumentos(id, client) !== versionEsperada) {
      return { ok: false as const, mensaje: "Las fotos cambiaron. Vuelva a abrir la ficha y revíselas." };
    }
    await client.query(
      `INSERT INTO cedulas_validadas (mjrv_id, validada_en) VALUES ($1, clock_timestamp())
       ON CONFLICT (mjrv_id, es_prueba) DO UPDATE SET validada_en = EXCLUDED.validada_en`, [id]);
    await client.query("UPDATE mjrv SET cedula_validada_en = coalesce(cedula_validada_en, clock_timestamp()), actualizado_en = clock_timestamp() WHERE id = $1", [id]);
    await registrarAuditoria({ portal: actor.portal, actorTipo: actor.tipo, actorId: actor.id, actorNombre: actor.nombre, accion: "cedula_validada", entidad: "mjrv", entidadId: id, datos: { modo, tipoDocumento: documentos.pasaporte ? "pasaporte" : "cedula" } }, client);
    return { ok: true as const, id };
  });
}

// La baja no borra historial: solo bloquea usos nuevos (la puerta responde «bloqueado»).
export async function cambiarBaja(sesion: Sesion, id: number, baja: boolean, motivo: string): Promise<void> {
  const r = await query("UPDATE mjrv SET activo = $2, baja_motivo = $3, actualizado_en = now() WHERE id = $1 RETURNING id", [id, !baja, baja ? motivo.trim().slice(0, 200) || "Baja administrativa" : null]);
  if (r[0]) await registrarAuditoria({ portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: baja ? "mjrv_baja" : "mjrv_reactivado", entidad: "mjrv", entidadId: id });
}

export type ResultadoBorrar = { ok: true } | { ok: false; mensaje: string; revocar?: boolean; anularJuntaId?: number };
type ResultadoBorrarSeleccion =
  | { ok: true; borradas: number; retenidas: { id: number; mensaje: string; revocar?: boolean; anularJuntaId?: number }[] }
  | { ok: false; mensaje: string };

type Cliente = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

// La junta está constituida si los tres cargos están cubiertos y esta persona cubre uno.
async function juntaConstituidaCon(client: Cliente, id: number): Promise<{ etiqueta: string; juntaId: number; asignacion: boolean } | null> {
  const v = (await client.query(
    `SELECT v.junta_actual_id, ${juntaPublicaSql("j")} AS etiqueta
       FROM v_mjrv_asignacion v JOIN juntas_madrid j ON j.id = v.junta_actual_id WHERE v.mjrv_id = $1`, [id])).rows[0] as { junta_actual_id: number; etiqueta: string } | undefined;
  if (!v) return null;
  const personas = (await client.query(`${PERSONAS_CARGO} WHERE v.junta_actual_id = $1 OR v.junta_origen_id = $1`, [v.junta_actual_id])).rows as PersonaCargo[];
  const asignaciones = (await client.query("SELECT mjrv_id, junta_id, cargo, origen FROM asignaciones_cargo WHERE junta_id = $1 AND activa", [v.junta_actual_id])).rows as AsignacionCargo[];
  const c = cubrirCargos([v.junta_actual_id], personas, asignaciones).get(v.junta_actual_id);
  if (!c || c.vacantes.length > 0 || !c.cargos.some((x) => x.mjrvId === id)) return null;
  return { etiqueta: v.etiqueta, juntaId: v.junta_actual_id, asignacion: asignaciones.some((a) => a.mjrv_id === id) };
}

const TABLAS_DE_LA_FICHA = ["fichas_abiertas_finanzas", "pendientes_impresion", "firmas_recibo", "envios_credencial", "excepciones_disponibilidad", "decisiones_movimiento", "documentos_mjrv", "actas_pago", "asignaciones_cargo", "lecturas_puerta"];

async function eliminarFichas(client: PoolClient, ids: number[]) {
  await client.query(
    `UPDATE envios_credencial SET mjrv_id = NULL, destino = '', id_externo = NULL, error = NULL, creado_por = NULL
      WHERE mjrv_id = ANY($1::bigint[]) AND NOT simulado AND estado <> 'en_cola'`, [ids],
  );
  await client.query("UPDATE credenciales_revocadas SET mjrv_id = NULL WHERE mjrv_id = ANY($1::bigint[])", [ids]);
  for (const tabla of TABLAS_DE_LA_FICHA) await client.query(`DELETE FROM ${tabla} WHERE mjrv_id = ANY($1::bigint[])`, [ids]);
  await client.query("DELETE FROM mjrv WHERE id = ANY($1::bigint[])", [ids]);
}

async function intentarEliminar(client: PoolClient, ids: number[]): Promise<boolean> {
  await client.query("SAVEPOINT borrar_fichas");
  try {
    await eliminarFichas(client, ids);
  } catch (e) {
    if ((e as { code?: string }).code !== "23503") throw e;
    await client.query("ROLLBACK TO SAVEPOINT borrar_fichas");
    await client.query("RELEASE SAVEPOINT borrar_fichas");
    return false;
  }
  await client.query("RELEASE SAVEPOINT borrar_fichas");
  return true;
}

// El pago confirmado, el recibo emitido y la junta constituida se conservan.
export async function borrarMjrv(sesion: Sesion, id: number, confirmar: boolean): Promise<ResultadoBorrar> {
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, mensaje: "La ficha no existe." };
  const r = await borrarMjrvSeleccion(sesion, [id], confirmar);
  if (!r.ok) return r;
  const retenida = r.retenidas[0];
  return retenida ? { ok: false, ...retenida } : { ok: true };
}

export async function borrarMjrvSeleccion(sesion: Sesion, ids: number[], confirmar: boolean): Promise<ResultadoBorrarSeleccion> {
  if (!confirmar) return { ok: false, mensaje: "Confirme el borrado. No se borró nada." };
  if (!ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return { ok: false, mensaje: "Seleccione fichas válidas." };
  try {
    return await withTx(async (client) => {
      const seleccion = [...new Set(ids)];
      await client.query("SET LOCAL lock_timeout = '2s'");
      await client.query("SELECT modo FROM configuracion WHERE id = 1 FOR SHARE");
      // Orden de Mando: primero la junta, después las fichas. Puerta bloquea su ficha antes de dar ingreso.
      await client.query("SELECT pg_advisory_xact_lock(7001, id::int) FROM (SELECT id FROM juntas_madrid ORDER BY id) juntas");
      await client.query("LOCK TABLE mjrv IN EXCLUSIVE MODE");
      const existentes = new Set((await client.query<{ id: number }>(
        "SELECT id FROM mjrv WHERE id = ANY($1::bigint[])", [seleccion],
      )).rows.map((f) => f.id));
      // Bloquea la reserva de la cola mientras se revisa qué fichas se pueden borrar.
      const enCurso = new Set((await client.query<{ mjrv_id: number; intentos: number }>(
        "SELECT mjrv_id, intentos FROM envios_credencial WHERE mjrv_id = ANY($1::bigint[]) AND estado = 'en_cola' AND NOT simulado FOR UPDATE",
        [seleccion],
      )).rows.filter((f) => f.intentos > 0).map((f) => f.mjrv_id));
      const protegidas = new Map((await client.query<{ mjrv_id: number; pagada: boolean }>(
        `SELECT mjrv_id, bool_or(pagada) AS pagada FROM (
           SELECT mjrv_id, true AS pagada FROM pagos_confirmados WHERE mjrv_id = ANY($1::bigint[])
           UNION ALL
           SELECT mjrv_id, false FROM actas_pago WHERE mjrv_id = ANY($1::bigint[]) AND (ordinal_recibo IS NOT NULL OR importe_eur IS NOT NULL)
           UNION ALL
           SELECT mjrv_id, false FROM firmas_recibo WHERE mjrv_id = ANY($1::bigint[])
         ) protegidas GROUP BY mjrv_id`, [seleccion],
      )).rows.map((f) => [f.mjrv_id, f.pagada]));
      const retenidas: Extract<ResultadoBorrarSeleccion, { ok: true }>["retenidas"] = [];
      const borrables: number[] = [];
      for (const id of seleccion) {
        if (!existentes.has(id)) {
          retenidas.push({ id, mensaje: "La ficha ya no existe." });
          continue;
        }
        const pagada = protegidas.get(id);
        const junta = await juntaConstituidaCon(client, id);
        const partes = [
          pagada ? "Ya se pagó. Puede editar la ficha o revocar la credencial."
            : protegidas.has(id) ? "La ficha tiene un recibo emitido. Puede darla de baja para conservar el historial." : "",
          junta ? `La junta ${junta.etiqueta} quedó constituida con esta persona. Puede editar la ficha${junta.asignacion ? " o anular la asignación del cargo" : ""}.` : "",
          enCurso.has(id) ? "Hay un envío en curso. Vuelva a intentarlo cuando termine." : "",
        ].filter(Boolean);
        if (partes.length) {
          retenidas.push({ id, mensaje: partes.join(" "), ...(pagada && { revocar: true }), ...(junta?.asignacion && { anularJuntaId: junta.juntaId }) });
        } else borrables.push(id);
      }
      let borradas = borrables;
      if (borrables.length) {
        if (!await intentarEliminar(client, borrables)) {
          // Una referencia del otro modo puede impedir el borrado de su ficha aunque la política la oculte.
          borradas = [];
          for (const id of borrables) {
            if (await intentarEliminar(client, [id])) borradas.push(id);
            else retenidas.push({ id, mensaje: "La ficha conserva actividad relacionada en otro modo." });
          }
        }
        for (const id of borradas) {
          await registrarAuditoria({ portal: "admin", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre, accion: "mjrv_borrado", entidad: "mjrv", entidadId: id }, client);
        }
      }
      return { ok: true as const, borradas: borradas.length, retenidas };
    });
  } catch (e) {
    if (["40P01", "55P03"].includes((e as { code?: string }).code ?? "")) return { ok: false, mensaje: "Hay actividad en curso. No se borró nada. Inténtelo de nuevo." };
    throw e;
  }
}
