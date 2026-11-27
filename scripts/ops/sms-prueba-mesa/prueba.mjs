import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as esperar } from "node:timers/promises";

const clave = readFileSync("sms.key", "utf8").trim();
const entrada = readFileSync("prueba.json");
const filas = JSON.parse(entrada);
const huella = createHash("sha256").update(entrada).digest("hex");
if (!clave || huella !== "04bef379c19f70efa81008eded805380331f8de5a1371139ad4db3280c1a3223" || !Array.isArray(filas) || filas.length !== 3 ||
    new Set(filas.map(fila => fila.to)).size !== 3 ||
    filas.some(({ to, text }) => !/^34[67]\d{8}$/.test(to) || text.length > 160 || !/^[A-Za-z0-9 ,.:*/()-]+$/.test(text)))
  throw new Error("La prueba no coincide con las tres filas validadas.");

async function api(ruta, body) {
  const respuesta = await fetch("https://api.gateway360.com/api/3.0/" + ruta, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ api_key: clave, ...body }),
  });
  return { http: respuesta.status, json: await respuesta.json() };
}

const codigo = valor => typeof valor === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(valor) ? valor : null;
const referencias = filas.map((_, i) => "CNE29NOVMESACSVTEST" + (i + 1));
const finales = new Set(["DELIVRD", "UNDELIV", "EXPIRED", "REJECTD", "DELETED", "ERROR"]);
let solicitado = false;
try {
  const cuenta = await api("account/get-balance", {});
  if (cuenta.http !== 200 || cuenta.json.status !== "ok") {
    console.log(JSON.stringify({ cuenta: "rechazada", http: cuenta.http, codigo: codigo(cuenta.json.error_id) }));
    process.exit(1);
  }

  solicitado = true;
  const envio = await api("sms/send", {
    encoding: "GSM7", concat: 0,
    messages: filas.map(({ to, text }, i) => ({ from: "34913430250", to, text, custom: referencias[i] })),
  });
  if (envio.http !== 200 || envio.json.status !== "ok" || !Array.isArray(envio.json.result) || envio.json.result.length !== filas.length) {
    console.log(JSON.stringify({ envio: "sin confirmación", http: envio.http, codigo: codigo(envio.json.error_id) }));
    process.exit(1);
  }

  const aceptados = [];
  for (const [i, fila] of envio.json.result.entries()) {
    const indice = i + 1;
    const id = codigo(fila.sms_id);
    if (fila.status === "ok" && id && (!fila.custom || fila.custom === referencias[i])) {
      aceptados.push({ indice, id, acuse: "PENDIENTE" });
      console.log(JSON.stringify({ indice, envio: "aceptado", id, caracteres: filas[i].text.length, segmentos: 1 }));
    } else {
      console.log(JSON.stringify({ indice, envio: "sin confirmación", codigo: codigo(fila.error_id) }));
      process.exitCode = 1;
    }
  }

  for (const demora of [0, 3500, 6500, 10000, 12000]) {
    if (aceptados.every(fila => finales.has(fila.acuse))) break;
    await esperar(demora);
    await Promise.all(aceptados.filter(fila => !finales.has(fila.acuse)).map(async fila => {
      try {
        const informe = await api("sms/get-reports", { sms_id: fila.id });
        const item = informe.json.result?.find?.(dato => dato.sms_id === fila.id);
        fila.acuse = codigo(item?.status)?.toUpperCase() ?? fila.acuse;
      } catch { /* Los acuses se consultan sin repetir la solicitud. */ }
    }));
  }
  for (const { indice, acuse } of aceptados) console.log(JSON.stringify({ indice, acuse }));
} catch {
  console.error(solicitado ? "Resultado incierto. Compruebe el panel antes de repetir." : "La conexión no se autenticó.");
  process.exitCode = 1;
}
