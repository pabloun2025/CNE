import {
  createCipheriv, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, sign,
} from "node:crypto";
import { expect, it } from "vitest";
import { canjearEmision } from "@/server/justificante/emision.mjs";
import { compactarQr } from "@/server/justificante/compacto.cjs";

const puesto = "prueba";
const now = () => Date.parse("2026-11-29T16:00:00Z");
const firma = generateKeyPairSync("ed25519");
const receptor = generateKeyPairSync("x25519");
const opciones = { clavesPuestos: { [puesto]: firma.publicKey }, clavePrivada: receptor.privateKey, now };

// Genera sobres de prueba independientes del emisor Windows, incluidos recuentos fuera de rango.
function sobre(version: number, idHex: string) {
  const temporal = generateKeyPairSync("x25519");
  const publica = temporal.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const nonce = randomBytes(12);
  const cabecera = Buffer.concat([Buffer.from([version, puesto.length]), Buffer.from(puesto), publica, nonce]);
  const comun = diffieHellman({ privateKey: temporal.privateKey, publicKey: receptor.publicKey });
  const clave = hkdfSync("sha256", comun, nonce, "CNE-Madrid-2026-11-29/justificante/v1", 32);
  const cifrado = createCipheriv("aes-256-gcm", Buffer.from(clave), nonce);
  cifrado.setAAD(cabecera);
  const id = Buffer.from(idHex, "hex").toString("base64url");
  const datos = JSON.stringify(["0000000001", "PERSONA FICTICIA", "con", now(), id]);
  const bloque = Buffer.concat([cabecera, cifrado.update(datos), cifrado.final(), cifrado.getAuthTag()]);
  return Buffer.concat([bloque, sign(null, bloque, firma.privateKey)]).toString("base64url");
}

it("canjea el identificador opaco v1 y lee los enteros del corte firmado v2", () => {
  const idHex = "0001020304050010ff000005";
  const v1 = sobre(1, idHex);
  const v2 = sobre(2, idHex);
  expect(canjearEmision(v1, opciones)).not.toHaveProperty("corte");
  expect(compactarQr(v2)).toHaveLength(compactarQr(v1).length);
  const emision = canjearEmision(compactarQr(v2), opciones);
  expect(emision.id).toBe(Buffer.from(idHex, "hex").toString("base64url"));
  expect(emision.corte).toEqual({ equipo: 0x0102030405, total: 0x0010ff, sin: 5 });
  const modificado = Buffer.from(v2, "base64url");
  modificado[modificado.length - 84] ^= 1;
  expect(() => canjearEmision(modificado.toString("base64url"), opciones)).toThrow();
});

it("rechaza incluso sobres firmados con versión desconocida o recuentos inválidos", () => {
  for (const idHex of [
    "000000000000000001000000", "ffffffffffff000001000000",
    "000000000001000000000000", "000000000001000001000002",
  ]) {
    expect(() => canjearEmision(sobre(2, idHex), opciones)).toThrow();
  }
  expect(() => canjearEmision(sobre(3, "000000000001000001000000"), opciones)).toThrow();
});
