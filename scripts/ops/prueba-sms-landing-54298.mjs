import { setTimeout as esperar } from "node:timers/promises";

const apiKey = process.env.API_SMSQUEENS?.trim();
if (!apiKey) throw new Error("Falta API_SMSQUEENS.");
const mensaje = {
  from: "+34913430250",
  to: "34678882421",
  text: "Compatriota, este domingo 29 también hay elecciones en Ecuador. Te esperamos para votar en Madrid. Consulta tu junta: {LANDING}",
  custom: "CNE29NLANDING54298TEST",
};
const datos = {
  api_key: apiKey,
  landing_id: 54298,
  campaign_name: "Madrid 29N · Prueba individual de landing",
  encoding: "GSM7",
  concat: 0,
  messages: [mensaje],
};
const textoFijo = mensaje.text.replace("{LANDING}", "");
if (!/^[A-Za-z0-9é ,.:]+$/.test(textoFijo) || textoFijo.length > 120) throw new Error("Texto SMS inválido.");

async function api(ruta, body) {
  const r = await fetch(`https://api.gateway360.com/api/3.0/${ruta}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  return { http: r.status, json: await r.json() };
}

const codigo = (valor) => typeof valor === "string" && /^[A-Z0-9_]{1,60}$/.test(valor) ? valor : null;
const idValido = (valor) => typeof valor === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(valor);
let solicitado = false;
try {
  const simulacion = await api("sms/send-landing", { ...datos, fake: 1 });
  const prueba = simulacion.json.result?.[0];
  if (simulacion.http !== 200 || simulacion.json.status !== "ok" || prueba?.status !== "ok") {
    console.log(JSON.stringify({ simulacion: "rechazada", http: simulacion.http, codigo: codigo(prueba?.error_id ?? simulacion.json.error_id) }));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ simulacion: "aceptada", plantilla: datos.landing_id, caracteresSinEnlace: textoFijo.length }));
    solicitado = true;
    const real = await api("sms/send-landing", datos);
    const envio = real.json.result?.[0];
    if (real.http !== 200 || real.json.status !== "ok" || envio?.status !== "ok" || !idValido(envio?.sms_id)) {
      console.log(JSON.stringify({ real: "sin_confirmacion", http: real.http, codigo: codigo(envio?.error_id ?? real.json.error_id) }));
      process.exitCode = 1;
    } else {
      const smsId = envio.sms_id;
      console.log(JSON.stringify({ real: "aceptado", smsId }));
      let acuse = null;
      for (const demora of [0, 4000, 6500, 9000]) {
        await esperar(demora);
        try {
          const informe = await api("sms/get-reports", { api_key: apiKey, sms_id: smsId });
          const fila = informe.json.result?.find?.((item) => item.sms_id === smsId);
          acuse = codigo(fila?.status) ?? acuse;
          if (["DELIVRD", "UNDELIV", "EXPIRED", "REJECTD", "DELETED"].includes(acuse)) break;
        } catch {
          // Un fallo al consultar el acuse no cambia la aceptación ni dispara otro envío.
        }
      }
      console.log(JSON.stringify({ acuse: acuse ?? "PENDIENTE" }));
    }
  }
} catch {
  console.error(solicitado ? "Resultado del SMS real incierto. Consultar el panel antes de repetir." : "Sin respuesta válida en la simulación. El SMS real no se solicitó.");
  process.exitCode = 1;
}
