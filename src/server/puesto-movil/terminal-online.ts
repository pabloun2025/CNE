import { createHmac, timingSafeEqual } from "node:crypto";
import { masterKey } from "../crypto";
import { query, withTx } from "../db";
import { ErrorJustificante } from "../justificante/servicio";

const firmaEnlace = /^([1-9]\d?)\.([A-Za-z0-9_-]{22})$/;
const instalacionValida = /^[0-9a-f]{16}$/;

function firma(terminal: string) {
  const clave = masterKey();
  try {
    return createHmac("sha256", clave).update("cne/madrid/29n/terminal-online/" + terminal).digest().subarray(0, 16).toString("base64url");
  } finally { clave.fill(0); }
}

export async function asignarTerminalEnLinea(numero: unknown) {
  if (typeof numero !== "number" || !Number.isInteger(numero) || numero < 1 || numero > 99)
    throw new ErrorJustificante(400, "Indique un número de puesto del 1 al 99.");
  const terminal = String(numero);
  const acceso = firma(terminal);
  await query("INSERT INTO cne.puesto_terminal_online (terminal) VALUES ($1) ON CONFLICT DO NOTHING", [numero]);
  return "https://cne.consulado.app/puesto-movil#terminal=" + terminal + "." + acceso;
}

export async function registrarConsultaMovil(id: string, tipo: "con" | "sin", enlace: unknown, instalacion: unknown) {
  if (enlace === undefined && instalacion === undefined) {
    await query("INSERT INTO cne.puesto_movil_actividad (id,tipo) VALUES ($1,$2)", [id, tipo]);
    return;
  }
  const codigo = typeof enlace === "string" ? firmaEnlace.exec(enlace) : null;
  if (!codigo || typeof instalacion !== "string" || !instalacionValida.test(instalacion) ||
      !timingSafeEqual(Buffer.from(codigo[2]), Buffer.from(firma(codigo[1]))))
    throw new ErrorJustificante(403, "El enlace numerado no es válido. Solicite el enlace a coordinación.");

  await withTx(async client => {
    const terminal = Number(codigo[1]);
    const { rowCount } = await client.query(`
      UPDATE cne.puesto_terminal_online SET instalacion=$2
      WHERE terminal=$1 AND (instalacion IS NULL OR instalacion=$2) RETURNING terminal
    `, [terminal, instalacion]);
    if (!rowCount) throw new ErrorJustificante(409, "Ese número ya está en uso en otro navegador. Solicite otro número a coordinación.");
    await client.query("INSERT INTO cne.puesto_movil_actividad (id,tipo,terminal_online) VALUES ($1,$2,$3)", [id, tipo, terminal]);
  }).catch(error => {
    if ((error as { code?: string }).code === "23505")
      throw new ErrorJustificante(409, "Este navegador ya está asociado a otro número. Use el enlace asignado.");
    throw error;
  });
}
