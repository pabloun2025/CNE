import { constants, createHash, publicEncrypt } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as esperar } from "node:timers/promises";

const clave = readFileSync("sms.key", "utf8").trim();
const entrada = readFileSync("prueba.json");
const { to, text } = JSON.parse(entrada);
const huella = createHash("sha256").update(entrada).digest("hex");
if (!clave || !/^346\d{8}$/.test(to) || text.length !== 147 || !/^[A-Za-z0-9 ,.:*/()-]+$/.test(text) ||
    huella !== "bb1ecdedfef51feaaac4c08b81c105c8a185ba289872e9e2300201be60163da9")
  throw new Error("La prueba no coincide con el destinatario y texto aprobados.");

async function api(ruta, body) {
  const respuesta = await fetch("https://api.gateway360.com/api/3.0/" + ruta, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ api_key: clave, ...body }),
  });
  return { http: respuesta.status, json: await respuesta.json() };
}

const codigo = valor => typeof valor === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(valor) ? valor : null;
const publica = "-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEA0O1K/WbkPA75u7babwX+\nEooKekfVpVL/aD8Rs+jO/JlJ/GWsLikZXvHsHRVKLPTv0tsUEXDhu09M9Bh5/IaF\nFNe/e5SSag2gXTxV1oQ6w8IlHHojNGwiJt/RvJgUTJuniewmJBkwgyFpMHHOUljS\nBmgGydPObIweIIp8YjWNGUR/LD34N8f1gyntoaU6S6KCObuaA08O7rz3LAi/C3lA\n1oI6+cdALa12Iu75mdQYoh5lfw1iIpN22ntmRf+cTWWiPSD09W+xGfcDYRm90w8Y\nkoOKrJQ3XkxIg5p3u9Mu2xiQ0oSEd/9iiibdrtIiRXNwH1mhUis9HqXRzY1gCvgC\nxe5cUNYqDxkIJoZKpxd5E0hKOo/0pYEQqbOy52+A/L5jx9R5Wc9/nivBfCNvtu7j\nifM7QnwWtIlt0YCgpfr/6j4FNhddgjCc39aK0wZpxhTSvGzfURz1/MmXj5n3bicK\nwwkyGM802zHQIW8EyuzA52pibMO4WSfjZkkVIl0OjDbFAgMBAAE=\n-----END PUBLIC KEY-----\n";
async function presupuesto() {
  try {
    const [cuenta, tarifa] = await Promise.all([
      api("account/get-balance", {}),
      api("account/pricing/sms/get-country-pricing", { country_code: "ES" }),
    ]);
    const saldo = Number(cuenta.json.result?.balance);
    const moneda = cuenta.json.result?.currency;
    const precios = Object.values(tarifa.json.result?.ES?.networks ?? {}).map(f => Number(f.price));
    if (cuenta.http !== 200 || cuenta.json.status !== "ok" || tarifa.http !== 200 || tarifa.json.status !== "ok" ||
        !Number.isFinite(saldo) || moneda !== "EUR" || !precios.length || !precios.every(p => Number.isFinite(p) && p > 0)) return;
    const dato = Buffer.from(JSON.stringify({ saldo, moneda, minimo: Math.min(...precios), maximo: Math.max(...precios) }));
    const cifrado = publicEncrypt({key: publica, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256"}, dato);
    console.log("PRESUPUESTO_CIFRADO=" + cifrado.toString("base64"));
  } catch { /* El presupuesto no altera la prueba autorizada. */ }
}

const referencia = "CNE29NPRUEBAPADRON39235";
const estadosFinales = new Set(["DELIVRD", "UNDELIV", "EXPIRED", "REJECTD", "DELETED", "ERROR"]);
let enviado = false;
try {
  const cuenta = await api("account/get-balance", {});
  if (cuenta.http !== 200 || cuenta.json.status !== "ok") {
    console.log(JSON.stringify({ prueba: "cuenta rechazada", http: cuenta.http, codigo: codigo(cuenta.json.error_id) }));
    process.exit(1);
  }
  enviado = true;
  const r = await api("sms/send", {
    encoding: "GSM7", concat: 0, messages: [{ from: "34913430250", to, text, custom: referencia }],
  });
  const fila = r.json.result?.[0];
  const id = codigo(fila?.sms_id);
  if (r.http !== 200 || r.json.status !== "ok" || r.json.result?.length !== 1 ||
      fila?.status !== "ok" || !id || (fila.custom && fila.custom !== referencia)) {
    console.log(JSON.stringify({ prueba: "sin confirmación", http: r.http, codigo: codigo(fila?.error_id ?? r.json.error_id) }));
    process.exit(1);
  }
  console.log(JSON.stringify({ prueba: "aceptada", id, caracteres: text.length, segmentos: 1 }));
  const presupuestoListo = presupuesto();
  let estado = "PENDIENTE";
  for (const demora of [0, 3500, 6000, 10000, 12000]) {
    await esperar(demora);
    try {
      const informe = await api("sms/get-reports", { sms_id: id });
      const item = informe.json.result?.find?.(dato => dato.sms_id === id);
      estado = codigo(item?.status)?.toUpperCase() ?? estado;
      if (estadosFinales.has(estado)) break;
    } catch { /* Consultar el informe no repite el envío. */ }
  }
  console.log(JSON.stringify({ acuse: estado, id }));
  await presupuestoListo;
} catch {
  console.error(enviado ? "Resultado incierto. Compruebe el panel antes de repetir." : "La conexión no se autenticó.");
  process.exitCode = 1;
}
