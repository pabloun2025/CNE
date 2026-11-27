import { parsePhoneNumberFromString } from "libphonenumber-js";
import { CARGOS, type Cargo } from "../domain/cargos";
import { registrarAuditoria } from "./auditoria";
import { withTx } from "./db";
import { juntaPublicaSql } from "./junta-sql";
import { afectaActuacionVerificada, coberturaEnTx, insertarAsignacion, MENSAJE_ACTUACION, type Actor, type Resultado } from "./movimientos";

export type DatosIncorporar = { nombres: string; apellidos: string; cedula: string; juntaId: number; cargo: string; telefono?: string; correo?: string };

// Mismo tratamiento de la cédula que el importador: mayúsculas, sin espacios, y el cero que Excel pierde en las de 10 dígitos.
export function normalizarCedula(texto: string): string {
  const c = texto.toUpperCase().replace(/\s+/g, "");
  return /^\d{9}$/.test(c) ? `0${c}` : c;
}

// Incorpora a un votante como MJRV (09 §3.6): ficha nueva, presente desde ya, con el cargo vacante que cubre. Una sola transacción.
export async function incorporarVotante(a: Actor, d: DatosIncorporar): Promise<Resultado> {
  const nombres = d.nombres.trim(), apellidos = d.apellidos.trim();
  if (!nombres || !apellidos || nombres.length > 120 || apellidos.length > 120) return { ok: false, mensaje: "Escriba los nombres y apellidos (hasta 120 letras)." };
  const cedula = normalizarCedula(d.cedula);
  if (!/^[0-9A-Z-]{5,20}$/.test(cedula)) return { ok: false, mensaje: "La cédula no es válida (5 a 20 letras mayúsculas, números o guiones)." };
  if (!(CARGOS as string[]).includes(d.cargo)) return { ok: false, mensaje: "Elija el cargo que cubrirá." };
  const correo = (d.correo ?? "").trim().toLowerCase() || null;
  if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { ok: false, mensaje: "El correo no es válido." };
  let telefono: string | null = null;
  if ((d.telefono ?? "").trim()) {
    const p = parsePhoneNumberFromString(d.telefono!.trim(), "ES");
    if (!p?.isValid()) return { ok: false, mensaje: "El teléfono no es válido (use el prefijo del país si no es español)." };
    telefono = p.number;
  }
  const cargo = d.cargo as Cargo;

  return withTx(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(7001, $1)", [d.juntaId]);
    const junta = (await client.query<{ e: string }>(`SELECT ${juntaPublicaSql("juntas_madrid")} AS e FROM juntas_madrid WHERE id = $1`, [d.juntaId])).rows[0];
    if (!junta) return { ok: false as const, mensaje: "La junta no existe." };
    // La cédula es única (también entre fichas de baja): nunca se crea una segunda ficha.
    const previa = (await client.query<{ activo: boolean; junta: string }>(
      `SELECT m.activo, ${juntaPublicaSql("jo")} AS junta FROM mjrv m JOIN juntas_madrid jo ON jo.id = m.junta_origen_id WHERE m.cedula = $1`, [cedula])).rows[0];
    if (previa) return { ok: false as const, mensaje: `Ya existe una ficha con esa cédula (junta ${previa.junta}, estado ${previa.activo ? "activa" : "de baja"}). No se creó otra.` };
    if (await afectaActuacionVerificada(client, d.juntaId, cargo)) return { ok: false, mensaje: MENSAJE_ACTUACION };
    if (!(await coberturaEnTx(client, d.juntaId)).vacantes.includes(cargo)) return { ok: false as const, cambio: true, mensaje: `La situación cambió: el cargo de ${cargo} de ${junta.e} ya no está vacante. No se creó la ficha.` };
    const m = (await client.query<{ id: number }>(
      `INSERT INTO mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, correo, telefono_e164, fuente_archivo, incorporado_en, incorporado_por, es_prueba)
       VALUES ($1,$2,$3,'VOTANTE INCORPORADO','otro',$4,$5,$6,'incorporado desde votantes', now(), $7, cne.en_prueba()) RETURNING id`,
      [cedula, apellidos, nombres, d.juntaId, correo, telefono, a.nombre])).rows[0];
    await insertarAsignacion(client, a, { mjrvId: m.id, juntaId: d.juntaId, cargo, origen: "incorporado" });
    await registrarAuditoria({ portal: "mando", actorTipo: a.tipo === "madrid_admin" ? "usuario" : "operador", actorId: a.id, actorNombre: a.nombre, accion: "votante_incorporado", entidad: "mjrv", entidadId: m.id, datos: { junta: junta.e, cargo } }, client);
    return { ok: true as const, mensaje: `Incorporado como ${cargo} de ${junta.e}.` };
  });
}
