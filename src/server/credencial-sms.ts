import { decryptBuffer, encryptBuffer } from "./crypto";

type FichaSms = { id: number; cedula: string; telefono: string };
const VERSION = "sms1";
const NONCE = 12;

export function tokenCredencialSms(ficha: FichaSms | null, expira: number): string {
  const datos = ficha ? `${ficha.id}|${ficha.cedula}|${ficha.telefono}` : "prueba";
  const { ciphertext, nonce } = encryptBuffer(Buffer.from(`${VERSION}|${expira}|${datos}`));
  return Buffer.concat([nonce, ciphertext]).toString("base64url");
}

export function leerTokenCredencialSms(token: string, ahora = Date.now()): FichaSms | "prueba" | null {
  if (!/^[A-Za-z0-9_-]{55,130}$/.test(token)) return null;
  try {
    const bytes = Buffer.from(token, "base64url");
    if (bytes.toString("base64url") !== token) return null;
    const texto = decryptBuffer(bytes.subarray(NONCE), bytes.subarray(0, NONCE)).toString("utf8");
    const [version, expira, ficha, cedula, telefono, ...sobran] = texto.split("|");
    if (version !== VERSION || !/^\d{13}$/.test(expira) || Number(expira) <= ahora || sobran.length) return null;
    if (ficha === "prueba" && cedula === undefined) return "prueba";
    const id = Number(ficha);
    if (!/^[1-9]\d*$/.test(ficha) || !Number.isSafeInteger(id) || !/^[0-9A-Z-]{5,20}$/.test(cedula) || !/^\+[1-9]\d{7,14}$/.test(telefono)) return null;
    return { id, cedula, telefono };
  } catch {
    return null;
  }
}
