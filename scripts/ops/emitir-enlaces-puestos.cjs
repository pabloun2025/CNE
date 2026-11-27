"use strict";

const { publicEncrypt, constants } = require("node:crypto");
const { crearEnlace, enlacePorToken } = require("./src/server/estaciones.ts");
const { decryptBuffer } = require("./src/server/crypto.ts");
const { query, closePools } = require("./src/server/db.ts");

const clavePublica = "-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAn5X4Kdf5PYi4/AVB2k/B\nVa11R6UU0lQp/fOa+02v75K/LTLMIKn1UPkVDdLL9wr7bpzdo4JniBv9Ldgli/GD\nD9yX5fJNyp/PIMRL6XuDfSNUdI5w/y1tploJ9gwHoBq+RZQEmLUbZuP3k783xo6P\n4jd4ZlCTsP1zy9RXur/kAGPPCy7iKC6U/5/c6yYZKMxqIug82XvO2A28oJes+5SN\nTvXJmpsyQr3sWsXPO2aZtFwoJ6apB6hya/tMVrrhRQ2RRN6H6k8NgubrnKFivWC1\n6VgamS/ui3hmPmsoZghTjyE73opuo8TDVOxUaftjJYPYN+U/E0qYMScIwAtk960J\ndH6fkZPDVCXxO0/v67H0oM6tUx9IOO2H2Ra1gUTClli5STF8oCHf6b3nS95Lez8g\nU/95aU7f887okh9GXTr5SYu4vrthyUyx8Ci+wwW9vTXpDOo5/KnlH3ulSKtRaOKH\nySq7+Xk9hC3k+eiV1k2iY0oUePieTmt5+fHJpJzjtopVAgMBAAE=\n-----END PUBLIC KEY-----\n";

const caducidad = new Date("2026-12-01T00:00:00+01:00");

async function emitir() {
  const [u] = await query("SELECT id, correo FROM usuarios WHERE tipo = 'superadmin' AND activo ORDER BY id LIMIT 1");
  if (!u) throw Error("No consta una cuenta de superadministración activa.");
  const operador = { usuarioId: u.id, correo: u.correo, nombre: "Configuración operativa solicitada", tipo: "superadmin", rol: "consul" };
  for (const [funcion, etiqueta] of [
    ["mesas", "MJRV · Personal de mesa 29N"],
    ["validacion_documental", "MJRV · Validación de documentos 29N"],
  ]) {
    const [vigente] = await query(
      `SELECT token_cifrado, token_nonce FROM enlaces_estacion WHERE funcion = $1 AND etiqueta = $2
       AND activo AND revocado_en IS NULL AND expira_en = $3 AND expira_en > now()
       AND token_cifrado IS NOT NULL AND token_nonce IS NOT NULL ORDER BY id DESC LIMIT 1`, [funcion, etiqueta, caducidad],
    );
    let token;
    if (vigente) {
      token = decryptBuffer(vigente.token_cifrado, vigente.token_nonce).toString();
    } else {
      const nuevo = await crearEnlace(operador, funcion, etiqueta, caducidad);
      if (!nuevo.ok) throw Error(nuevo.mensaje);
      token = nuevo.token;
    }
    if ((await enlacePorToken(token))?.funcion !== funcion) throw Error("El enlace emitido no está activo.");
    const cifrado = publicEncrypt({
      key: clavePublica, oaepHash: "sha256", padding: constants.RSA_PKCS1_OAEP_PADDING,
    }, Buffer.from(token));
    console.log(funcion.toUpperCase() + "_CIFRADO=" + cifrado.toString("base64"));
  }
  console.log("Dos enlaces revocables verificados por función.");
}
emitir().catch((error) => {
  console.error("Enlaces de puestos: " + String(error.message));
  process.exitCode = 1;
}).finally(closePools);
