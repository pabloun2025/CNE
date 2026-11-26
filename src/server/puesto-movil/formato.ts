import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// CPD2 (nonce de 12 bytes, etiqueta de 16 bytes y JSON cifrado). Compatible con el importador de custodia.
export const MARCA = Buffer.from("CPD2");
export type Elector = Readonly<{
  nombre: string;
  junta: string | null;
  zona: string | null;
  recinto: string;
  verificarWeb: boolean;
}>;

export function indexar(filas: unknown): Map<string, Elector> {
  const indice = new Map<string, Elector>();
  if (!Array.isArray(filas) || !filas.length || filas.length > 150_000) throw Error("Cantidad de electores no válida.");
  for (const fila of filas) {
    if (!fila || typeof fila.cedula !== "string" || !/^\d{10}$/.test(fila.cedula) || indice.has(fila.cedula) ||
        typeof fila.nombre !== "string" || fila.nombre.length < 2 || fila.nombre.length > 120 ||
        typeof fila.recinto !== "string" || !fila.recinto.trim() || fila.recinto.length > 120 ||
        !(fila.junta === null || (typeof fila.junta === "string" && /^[MF][1-9]\d{0,2}$/.test(fila.junta))) ||
        !(fila.zona === null || (typeof fila.zona === "string" && !!fila.zona.trim() && fila.zona.length <= 40)) ||
        (fila.verificarWeb !== undefined && typeof fila.verificarWeb !== "boolean")) throw Error("Ficha electoral no válida.");
    indice.set(fila.cedula, Object.freeze({ nombre: fila.nombre, junta: fila.junta, zona: fila.zona, recinto: fila.recinto, verificarWeb: fila.verificarWeb === true }));
  }
  return indice;
}

export function descifrar(archivo: Buffer, clave: Buffer): Map<string, Elector> {
  if (clave.length !== 32 || archivo.length <= 32 || !archivo.subarray(0, 4).equals(MARCA)) throw Error("Formato de padrón no válido.");
  const gcm = createDecipheriv("aes-256-gcm", clave, archivo.subarray(4, 16));
  gcm.setAAD(MARCA);
  gcm.setAuthTag(archivo.subarray(16, 32));
  const plain = gcm.update(archivo.subarray(32));
  try {
    // GCM autentica el bloque completo en final(), antes de analizar o indexar las fichas.
    gcm.final();
    return indexar(JSON.parse(plain.toString("utf8")));
  } finally { plain.fill(0); }
}

export function cifrar(registros: ReadonlyMap<string, Elector>, clave: Buffer) {
  const filas = Array.from(registros, ([cedula, { verificarWeb, ...ficha }]) =>
    ({ cedula, ...ficha, ...(verificarWeb ? { verificarWeb } : {}) }));
  const plain = Buffer.from(JSON.stringify(filas));
  const nonce = randomBytes(12);
  try {
    const gcm = createCipheriv("aes-256-gcm", clave, nonce);
    gcm.setAAD(MARCA);
    const datos = Buffer.concat([gcm.update(plain), gcm.final()]);
    return Buffer.concat([MARCA, nonce, gcm.getAuthTag(), datos]);
  } finally { plain.fill(0); }
}
