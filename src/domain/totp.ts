import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// TOTP según RFC 6238 (HMAC-SHA1, 6 dígitos, 30 segundos), compatible con
// Google Authenticator, Microsoft Authenticator, FreeOTP y similares.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PERIOD = 30;
const DIGITS = 6;

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Secreto TOTP no válido.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCode(secret: string, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1]! & 15;
  const binary = ((digest[offset]! & 127) << 24) | (digest[offset + 1]! << 16) | (digest[offset + 2]! << 8) | digest[offset + 3]!;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function totpCounter(now: Date): number {
  return Math.floor(now.getTime() / 1000 / PERIOD);
}

// Devuelve el contador que coincide (para impedir reutilizar el mismo código) o null.
// Admite un periodo de desfase en cada sentido.
export function verifyTotp(secret: string, code: string, now: Date, lastUsedCounter: number | null): number | null {
  const typed = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(typed)) return null;
  const current = totpCounter(now);
  for (const counter of [current - 1, current, current + 1]) {
    if (lastUsedCounter !== null && counter <= lastUsedCounter) continue;
    const expected = Buffer.from(totpCode(secret, counter));
    if (timingSafeEqual(expected, Buffer.from(typed))) return counter;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer = "CNE Madrid"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`;
}

// Códigos de un solo uso para cuando no se tiene el teléfono a mano.
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(6)).slice(0, 8).toLowerCase();
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}

export function recoveryCodeHash(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase().replace(/\s/g, "")).digest("hex");
}
