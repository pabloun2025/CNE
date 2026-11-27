import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as esperar } from "node:timers/promises";

const clave = readFileSync("sms.key", "utf8").trim();
const entrada = readFileSync("prueba.json");
const { to, text } = JSON.parse(entrada);
const huella = createHash("sha256").update(entrada).digest("hex");
if (!clave || !/^346\d{8}$/.test(to) || text.length !== 150 || !/^[A-Za-z0-9 ,.:*/()-]+$/.test(text) ||
    huella !== "f3ea514fbbe32f0c41b8d6bc244c33d4b8003e866d25d7c768014a79a22c1862")
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
const referencia = "CNE29NPRUEBAMESAMADRID";
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
} catch {
  console.error(enviado ? "Resultado incierto. Compruebe el panel antes de repetir." : "La conexión no se autenticó.");
  process.exitCode = 1;
}
