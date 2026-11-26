import { createHmac } from "node:crypto";
import { decryptBuffer, encryptBuffer, masterKey } from "../crypto";
import { query } from "../db";

const contexto = "cne/madrid/puesto-movil/contacto-ausente/2026/v1";

function huellaCedula(cedula: string): Buffer {
  const clave = masterKey();
  try { return createHmac("sha256", clave).update(contexto + "/" + cedula).digest(); }
  finally { clave.fill(0); }
}

export async function guardarContactoAusente(id: string, vence: number, nombre: string, cedula: string, correo: string) {
  const plain = Buffer.from(JSON.stringify([contexto, nombre, cedula, correo]));
  let cifrado: ReturnType<typeof encryptBuffer>;
  try { cifrado = encryptBuffer(plain); } finally { plain.fill(0); }
  // La comprobación del turno y la deduplicación comparten una sola operación de base de datos.
  const filas = await query(`
    INSERT INTO cne.puesto_movil_contactos (huella_cedula, nonce, cifrado)
    SELECT $1::bytea, $2::bytea, $3::bytea FROM cne.puesto_movil_actividad
    WHERE id=$4 AND tipo='sin' AND estado='pendiente' AND clock_timestamp() < to_timestamp($5::double precision / 1000)
    ON CONFLICT (huella_cedula) DO UPDATE SET nonce=EXCLUDED.nonce, cifrado=EXCLUDED.cifrado
    RETURNING 1`, [huellaCedula(cedula), cifrado.nonce, cifrado.ciphertext, id, vence]);
  return filas.length === 1;
}

export async function exportarContactos(): Promise<ArrayBuffer> {
  const { utils, write } = await import("xlsx");
  const registros = await query<{ huella_cedula: Buffer; nonce: Buffer; cifrado: Buffer }>(
    "SELECT huella_cedula, nonce, cifrado FROM cne.puesto_movil_contactos");
  const contactos = registros.map(({ huella_cedula, nonce, cifrado }) => {
    const plain = decryptBuffer(cifrado, nonce);
    try {
      const [uso, nombre, cedula, correo] = JSON.parse(plain.toString("utf8"));
      if (uso !== contexto || typeof nombre !== "string" || typeof cedula !== "string" || typeof correo !== "string" ||
          !huellaCedula(cedula).equals(huella_cedula)) throw Error("Contacto no válido.");
      return [nombre, cedula, correo] as string[];
    } finally { plain.fill(0); }
  });
  const orden = new Intl.Collator("es");
  contactos.sort((a,b) => orden.compare(a[0],b[0]) || a[1].localeCompare(b[1]));
  const filas = [["Nombre", "Cédula", "Correo electrónico"], ...contactos];
  // Se fija el tipo también para nombres que comiencen por '=' y cédulas con ceros iniciales.
  const hoja = utils.aoa_to_sheet(filas.map(fila => fila.map(v => ({ t:"s", v, z:"@" }))));
  hoja["!cols"] = [{wch:42}, {wch:16}, {wch:42}];
  const libro = utils.book_new();
  utils.book_append_sheet(libro, hoja, "No empadronados");
  return write(libro, { bookType:"xlsx", type:"array" }) as ArrayBuffer;
}
