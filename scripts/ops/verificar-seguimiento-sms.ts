import { requiredEnv } from "../../src/server/env";
import { urlAcuseSms } from "../../src/server/envios/sms-seguimiento";

async function verificar() {
  const host = process.env.HOST_MADRID ?? "madrid.consulado.app";
  const url = urlAcuseSms(host, Number.MAX_SAFE_INTEGER);
  const opciones = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([{ sms_id: "CNEPRUEBA", to: "34600000000", status: "DELIVRD" }]),
    signal: AbortSignal.timeout(15000),
  };
  const sinFirma = new URL(url);
  sinFirma.search = "";
  if ((await fetch(sinFirma, opciones)).status !== 401 || !(await fetch(url, opciones)).ok) {
    throw new Error("El webhook SMS publicado no pasó la comprobación de firma o disponibilidad.");
  }
  console.log("Webhook SMS publicado: acepta el acuse firmado y rechaza peticiones sin firma.");
  const balance = await fetch("https://api.gateway360.com/api/3.0/account/get-balance", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ api_key: requiredEnv("SMSPUBLI_API") }),
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!balance.ok || (await balance.json()).status !== "ok") {
    throw new Error("No se pudo acceder a SMS Publi desde producción.");
  }
  console.log("Acceso a SMS Publi verificado desde CNE.");
}
verificar().catch(() => {
  console.error("No se pudo verificar el seguimiento SMS o el acceso al proveedor desde producción.");
  process.exitCode = 1;
});
