import { setTimeout as esperar } from "node:timers/promises";

const apiKey = process.env.API_SMSQUEENS?.trim();
if (!apiKey) throw new Error("Falta API_SMSQUEENS.");
const destinos = [
  { persona: "Justina", to: "34661172389", custom: "CNE29NFINAL215041J" },
  { persona: "Pablo", to: "34678882421", custom: "CNE29NFINAL215041P" },
];
const texto = "Compatriota, este domingo 29 son las elecciones de Ecuador. Votemos en Madrid con el orgullo de ser ecuatorianos. Revisa dónde votar: {LANDING}";
const text = texto.replace("dónde", "donde");
const textoFijo = text.replace("{LANDING}", "");
if (!/^[A-Za-z0-9 ,.:]+$/.test(textoFijo) || textoFijo.length !== 134) throw new Error("Texto SMS inválido.");

async function api(ruta, body) {
  const respuesta = await fetch(`https://api.gateway360.com/api/3.0/${ruta}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ api_key: apiKey, ...body }),
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  return { http: respuesta.status, json: await respuesta.json() };
}

const codigo = (valor) => typeof valor === "string" && /^[A-Z0-9_]{1,60}$/.test(valor) ? valor : null;
const idValido = (valor) => typeof valor === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(valor);
const terminales = new Set(["DELIVRD", "UNDELIV", "EXPIRED", "REJECTD", "DELETED"]);
let solicitado = false;
try {
  const cuenta = await api("account/get-balance", {});
  if (cuenta.http !== 200 || cuenta.json.status !== "ok") {
    console.log(JSON.stringify({ cuenta: "rechazada", http: cuenta.http, codigo: codigo(cuenta.json.error_id) }));
    process.exit(1);
  }
  solicitado = true;
  const real = await api("sms/send-landing", {
    landing_id: 215041,
    campaign_name: "Madrid 29N · Prueba del texto final",
    encoding: "GSM7",
    concat: 0,
    messages: destinos.map(({ to, custom }) => ({ from: "+34913430250", to, text, custom })),
  });
  const respuestas = real.json.result;
  if (real.http !== 200 || real.json.status !== "ok" || !Array.isArray(respuestas) || respuestas.length !== destinos.length) {
    console.log(JSON.stringify({ real: "sin_confirmacion", http: real.http, codigo: codigo(real.json.error_id) }));
    process.exit(1);
  }
  const aceptados = [];
  for (const [i, fila] of respuestas.entries()) {
    const { persona, custom } = destinos[i];
    if (fila.status === "ok" && idValido(fila.sms_id) && (!fila.custom || fila.custom === custom)) {
      aceptados.push({ persona, smsId: fila.sms_id, acuse: null });
      console.log(JSON.stringify({ persona, real: "aceptado", smsId: fila.sms_id }));
    } else {
      console.log(JSON.stringify({ persona, real: "sin_confirmacion", codigo: codigo(fila.error_id) }));
      process.exitCode = 1;
    }
  }
  for (const demora of [0, 4000, 6500, 9000]) {
    await esperar(demora);
    await Promise.all(aceptados.filter(({ acuse }) => !terminales.has(acuse)).map(async (envio) => {
      try {
        const informe = await api("sms/get-reports", { sms_id: envio.smsId });
        const fila = informe.json.result?.find?.((item) => item.sms_id === envio.smsId);
        envio.acuse = codigo(fila?.status) ?? envio.acuse;
      } catch {
        // Consultar un acuse nunca repite el envío.
      }
    }));
    if (aceptados.every(({ acuse }) => terminales.has(acuse))) break;
  }
  for (const { persona, acuse } of aceptados) console.log(JSON.stringify({ persona, acuse: acuse ?? "PENDIENTE" }));
} catch {
  console.error(solicitado ? "Resultado incierto. Consultar el panel antes de repetir." : "No fue posible autenticar la cuenta.");
  process.exitCode = 1;
}
