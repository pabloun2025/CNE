import { constants, publicEncrypt } from "node:crypto";
import { readFileSync } from "node:fs";
const key = readFileSync("sms.key", "utf8").trim();
const publica = "-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAroPnsV22ZFOn1ctFN/Yn\nWMctQCC79zt1c+rSkbR4OB4+hoCd1AbI92wSpofL+W1DM+O+VHn2AaqEshDVK6rg\nUNmdfxSuAzol4PHWllWDSMRmIb5Eog661EgIMITa42Gd9crKTACsDSuILgE25/jc\n7oJS1EZTOiLiwzVIvqHoCGPkJkm84ZRLf/8SSiCvNglkk8HJqj9/vIdMOA+PK0ED\niyKzJhukWNSoyJD2aP5H9ChUQn75Xw7rYuAUCcBk1VY0yY+isYEwZX1Lhazo34ja\niosWJ3NRlcwIA9JE/BnuEo/LSnjsFZKxMRov34JUXQaxW1OzzqCBblxSr/3l8A92\nxlles4wJLXQhzPN4cKdZA69lJ69VBl3+yAIN9v26sSzFjmnhFGJakKw6uHJuZIxA\nLdcAdkPQyaa0T7Ktn/v2wk0kvqQw/PQJcp+v/c5S2C33JsINFa7RBJel/hK6BZZa\nBXSBVpIWXr52JhoXJTwGpvouESWR4joSh3SSH1W/C84jAgMBAAE=\n-----END PUBLIC KEY-----\n";
async function api(ruta, body) {
  const respuesta = await fetch("https://api.gateway360.com/api/3.0/" + ruta, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(12000),
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ api_key: key, ...body }),
  });
  if (!respuesta.ok) throw Error("Proveedor no disponible.");
  const dato = await respuesta.json();
  if (dato.status !== "ok") throw Error("Proveedor no disponible.");
  return dato.result;
}
try {
  if (!key) throw Error();
  const [cuenta, tarifa] = await Promise.all([
    api("account/get-balance", {}),
    api("account/pricing/sms/get-country-pricing", { country_code: "ES" }),
  ]);
  const saldo = Number(cuenta?.balance);
  const precios = Object.values(tarifa?.ES?.networks ?? {}).map(f => Number(f.price));
  if (cuenta?.currency !== "EUR" || !Number.isFinite(saldo) || !precios.length || !precios.every(p=>Number.isFinite(p)&&p>0)) throw Error();
  const salida = Buffer.from(JSON.stringify({saldo, minimo:Math.min(...precios), maximo:Math.max(...precios), moneda:cuenta.currency}));
  console.log("SALDO_CIFRADO=" + publicEncrypt({key:publica,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:"sha256"},salida).toString("base64"));
} catch {
  console.error("No se pudo consultar el saldo y la tarifa.");
  process.exitCode = 1;
}
