import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { validarMovil } from "../../src/domain/ingreso";
import type { Serie } from "../../src/domain/juntas";
import { tokenCredencialSms } from "../../src/server/credencial-sms";
import { closePools, query, withTx } from "../../src/server/db";
import { loadEnv, requiredEnv } from "../../src/server/env";
import { enviarSmsPubli, mensajeSmsMadrid, remitenteSmsMadrid } from "../../src/server/envios/sms-publi";
import { hashEnlaceSms, urlAcuseSms } from "../../src/server/envios/sms-seguimiento";

const EXPIRA = Date.parse("2026-11-29T23:59:00+01:00");
const PADRON = {
  M: [159, "9c403e0cd6e7c57ff7d5fb0e309f24b5a65743e3d9337b7c48dbed49fe3d9122"],
  H: [117, "45b1a9ddcd15fcd739f0cdc51874598e4bb6af291d72f57c2eecbcb37de9cba2"],
} as const;

type Estado = "reservado" | "aceptado" | "entregado" | "fallo" | "incierto";
export type FichaLoteSms = {
  id: number; cedula: string; nombres: string; telefono: string | null;
  serie: Serie; numero: number; rol: string; estado: Estado | null;
};
type SmsPreparado = FichaLoteSms & { telefono: string; texto: string; remitente: string };

// F23 Secretaría figura vacante en la hoja oficial del 26/11. La ficha operativa conserva su estado.
const excluirSecretariaF23 = (ficha: FichaLoteSms) => ficha.serie === "M" && ficha.numero === 23 && ficha.rol === "secretario";
const cedulaCotejo = (cedula: string) => /^\d{9}$/.test(cedula) ? `0${cedula}` : cedula;
const huellaPadron = (fichas: FichaLoteSms[]) => createHash("sha256").update(fichas.map((ficha) => cedulaCotejo(ficha.cedula)).sort().join("\n")).digest("hex");

export function prepararLoteSmsMadrid(fichas: readonly FichaLoteSms[], permitirCompartido = false) {
  const incluidas = fichas.filter((ficha) => !excluirSecretariaF23(ficha));
  const femeninas = incluidas.filter(({ serie }) => serie === "M");
  const masculinas = incluidas.filter(({ serie }) => serie === "H");
  const padronCoincide = femeninas.length === PADRON.M[0] && masculinas.length === PADRON.H[0]
    && huellaPadron(femeninas) === PADRON.M[1] && huellaPadron(masculinas) === PADRON.H[1];

  const recuentoTelefonos = new Map<string, number>();
  for (const { telefono } of incluidas) {
    if (telefono) recuentoTelefonos.set(telefono, (recuentoTelefonos.get(telefono) ?? 0) + 1);
  }
  const compartidos = new Map([...recuentoTelefonos].filter(([, cantidad]) => cantidad > 1));
  const destinoF14 = incluidas.find(({ serie, numero, rol }) => serie === "M" && numero === 14 && rol === "vocal")?.telefono;
  const destinoF41 = incluidas.find(({ serie, numero, rol }) => serie === "M" && numero === 41 && rol === "presidente")?.telefono;
  const destinoConfirmado = permitirCompartido && destinoF14 && destinoF14 === destinoF41 && compartidos.get(destinoF14) === 2
    ? destinoF14 : null;
  const informe = {
    fichasF: femeninas.length, fichasM: masculinas.length, padronCoincide,
    excluidasF23Secretaria: fichas.length - incluidas.length,
    nombresInvalidos: 0, nombresLargos: 0, telefonosInvalidos: 0,
    destinosCompartidos: compartidos.size, fichasRetenidas: 0, pendientes: 0,
    existentes: { reservado: 0, aceptado: 0, entregado: 0, fallo: 0, incierto: 0 },
  };
  const preparadas: SmsPreparado[] = [];
  for (const ficha of incluidas) {
    const { telefono, estado } = ficha;
    const mensaje = mensajeSmsMadrid(ficha.nombres);
    if (!mensaje.ok) {
      if (mensaje.motivo === "nombre_largo") informe.nombresLargos++;
      else informe.nombresInvalidos++;
    }
    const movil = telefono && validarMovil(telefono);
    const telefonoValido = movil && movil.ok && movil.telefono === telefono && /^\+[1-9]\d{7,14}$/.test(telefono);
    if (!telefonoValido) informe.telefonosInvalidos++;
    if (estado) informe.existentes[estado]++;
    if (telefono && compartidos.has(telefono) && telefono !== destinoConfirmado) {
      informe.fichasRetenidas++;
      continue;
    }
    if (!mensaje.ok || !telefono || !telefonoValido) continue;
    if (!estado) informe.pendientes++;
    preparadas.push({ ...ficha, telefono, texto: mensaje.texto, remitente: remitenteSmsMadrid(ficha.serie) });
  }
  return { informe, preparadas };
}

const FICHA_ELEGIBLE = `m.activo AND NOT m.es_prueba AND m.incorporado_en IS NULL AND NOT cne.en_prueba()
  AND NOT EXISTS (SELECT 1 FROM cne.credenciales_revocadas r WHERE r.mjrv_id=m.id OR r.cedula=m.cedula)`;

async function leerFichas() {
  return query<FichaLoteSms>(
    `SELECT m.id, m.cedula, m.nombres, m.telefono_e164 AS telefono, j.serie, j.numero, m.rol, e.estado
       FROM cne.mjrv m JOIN cne.juntas_madrid j ON j.id=m.junta_origen_id
       LEFT JOIN LATERAL (SELECT estado FROM cne.envios_sms WHERE mjrv_id=m.id ORDER BY id DESC LIMIT 1) e ON true
      WHERE ${FICHA_ELEGIBLE}
      ORDER BY j.serie, j.numero, m.id`,
  );
}

async function reservarSms(ficha: SmsPreparado, tokenHash: string): Promise<number | null> {
  return withTx(async (client) => {
    // Serializa reservas de la misma ficha y comprueba que sigue siendo la que se cotejó.
    const vigente = await client.query(
      `SELECT 1 FROM cne.mjrv m JOIN cne.juntas_madrid j ON j.id=m.junta_origen_id
        WHERE m.id=$1 AND m.cedula=$2 AND m.nombres=$3 AND m.telefono_e164=$4
          AND j.serie=$5 AND j.numero=$6 AND m.rol=$7 AND ${FICHA_ELEGIBLE}
        FOR NO KEY UPDATE OF m`,
      [ficha.id, ficha.cedula, ficha.nombres, ficha.telefono, ficha.serie, ficha.numero, ficha.rol],
    );
    if (!vigente.rowCount) throw new Error("FICHA_CAMBIO");
    const anterior = await client.query("SELECT 1 FROM cne.envios_sms WHERE mjrv_id=$1 LIMIT 1", [ficha.id]);
    if (anterior.rowCount) return null;
    const reserva = await client.query<{ id: number }>(
      `INSERT INTO cne.envios_sms (mjrv_id, destino, remitente, estado, token_hash)
       VALUES ($1,$2,$3,'reservado',$4) ON CONFLICT DO NOTHING RETURNING id`,
      [ficha.id, ficha.telefono, ficha.remitente, tokenHash],
    );
    const id = reserva.rows[0]?.id;
    if (id === undefined) throw new Error("RESERVA_CONFLICTO");
    return id;
  });
}

export async function enviarLoteSmsMadrid(preparadas: readonly SmsPreparado[], apiKey: string, host: string) {
  const resultado = { aceptado: 0, entregado: 0, fallo: 0, incierto: 0, omitido: 0 };
  for (const ficha of preparadas) {
    if (ficha.estado) continue;
    if (Date.now() >= EXPIRA) throw new Error("ENLACES_CADUCADOS");
    const token = tokenCredencialSms(ficha, EXPIRA);
    const id = await reservarSms(ficha, hashEnlaceSms(token));
    if (id === null) {
      resultado.omitido++;
      continue;
    }
    // La transacción anterior ya se confirmó. Una caída aquí deja una reserva que nunca se reintenta sola.
    const envio = await enviarSmsPubli({
      id, destino: ficha.telefono, remitente: ficha.remitente, texto: ficha.texto,
      enlace: `https://${host}/s/${token}`, acuse: urlAcuseSms(host, id),
    }, { apiKey });
    const [fila] = await query<{ estado: Exclude<Estado, "reservado"> }>(
      `UPDATE cne.envios_sms SET
          estado=CASE WHEN estado='reservado' THEN $2 ELSE estado END,
          codigo_error=CASE WHEN estado='reservado' THEN $3 ELSE codigo_error END,
          id_externo=COALESCE(id_externo,$4), actualizado_en=now()
        WHERE id=$1 AND ($4::text IS NULL OR id_externo IS NULL OR id_externo=$4)
        RETURNING estado`,
      [id, envio.estado, envio.estado === "aceptado" ? null : envio.codigo, envio.estado === "aceptado" ? envio.idExterno : null],
    );
    if (!fila) throw new Error("SMS_SIN_CONCILIAR");
    resultado[fila.estado]++;
    if (fila.estado === "fallo" || fila.estado === "incierto") break;
  }
  return resultado;
}

async function main() {
  const modo = process.argv[2] ?? "comprobar";
  if (!["comprobar", "verificar", "enviar"].includes(modo) || process.argv.length > 3) {
    console.error("Use comprobar, verificar o enviar.");
    process.exitCode = 1;
    return;
  }
  loadEnv();
  const permitirCompartido = process.env.CNE_SMS_DESTINO_COMPARTIDO_CONFIRMADO === "1";
  const { informe, preparadas } = prepararLoteSmsMadrid(await leerFichas(), permitirCompartido);
  console.log(JSON.stringify(informe));
  if (!informe.padronCoincide || informe.nombresInvalidos || informe.nombresLargos || informe.telefonosInvalidos) {
    process.exitCode = 1;
    return;
  }
  if (modo !== "enviar" || !informe.pendientes) return;
  const host = process.env.HOST_MADRID?.trim() || "madrid.consulado.app";
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host)) throw new Error("HOST_MADRID_INVALIDO");
  const apiKey = requiredEnv("SMSPUBLI_API").trim();
  if (!apiKey) throw new Error("FALTA_SMSPUBLI_API");
  urlAcuseSms(host, 1);
  const r = await enviarLoteSmsMadrid(preparadas, apiKey, host);
  console.log(JSON.stringify(r));
  if (r.fallo || r.incierto) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("La operación SMS se detuvo. Consulte las reservas antes de relanzarla.");
    process.exitCode = 1;
  }).finally(closePools);
}
