const apiKey = process.env.API_SMSQUEENS?.trim();
if (!apiKey) throw new Error("Falta API_SMSQUEENS.");
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
try {
  const smsId = "8b670b9426784d37ac63b5168127b23c";
  const informe = await api("sms/get-reports", { api_key: apiKey, sms_id: smsId });
  const fila = informe.json.result?.find?.((item) => item.sms_id === smsId);
  console.log(JSON.stringify({ acuse: codigo(fila?.status) ?? "PENDIENTE", http: informe.http, codigo: codigo(informe.json.error_id) }));
  if (informe.http !== 200 || informe.json.status !== "ok") process.exitCode = 1;
} catch {
  console.error("No fue posible consultar el acuse.");
  process.exitCode = 1;
}
