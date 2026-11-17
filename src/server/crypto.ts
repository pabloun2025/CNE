import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { requiredEnv } from "./env";

export function masterKey(): Buffer {
  const raw = Buffer.from(requiredEnv("APP_MASTER_KEY"), "base64");
  if (raw.length !== 32) throw new Error("APP_MASTER_KEY debe decodificar a 32 bytes.");
  return raw;
}

export function encryptBuffer(plain: Buffer): { ciphertext: Buffer; nonce: Buffer } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { nonce, ciphertext: Buffer.concat([tag, encrypted]) };
}

export function decryptBuffer(ciphertext: Buffer, nonce: Buffer): Buffer {
  const tag = ciphertext.subarray(0, 16);
  const data = ciphertext.subarray(16);
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function secretHint(secret: string): string {
  const trimmed = secret.trim();
  if (trimmed.length < 8) return "••••";
  return `••••${trimmed.slice(-4)}`;
}

export function signHex(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function signaturesMatch(expectedHex: string, receivedHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(receivedHex, "hex");
  if (expected.length === 0 || expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
