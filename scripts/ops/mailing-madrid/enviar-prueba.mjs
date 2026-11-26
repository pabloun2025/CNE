import { readFileSync } from "node:fs";
import { setTimeout as esperar } from "node:timers/promises";

const apiKey = process.env.BREVO_API_KEY?.trim();
const para = "pabloun@gmail.com";
const cfg = JSON.parse(readFileSync(new URL("./mailing-madrid.json", import.meta.url), "utf8"));
const htmlContent = readFileSync(new URL(cfg.html, import.meta.url), "utf8");
if (!apiKey || cfg.replyTo !== "cecumadrid@cancilleria.gob.ec" ||
    !htmlContent.includes("Ecuador vota") || !htmlContent.includes("https://lugarvotacion.cne.gob.ec/")) {
  console.error("No se validó la plantilla o la conexión de Brevo.");
  process.exit(1);
}

async function api(path, body) {
  return fetch(`https://api.brevo.com/v3${path}`, {
    method: body ? "POST" : "GET",
    headers: { "api-key": apiKey, accept: "application/json", ...(body && { "content-type": "application/json" }) },
    ...(body && { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(body ? 20000 : 8000),
  });
}

let iniciada = false;
try {
  const r = await api("/senders");
  const d = await r.json();
  const activos = new Set((Array.isArray(d.senders) ? d.senders : [])
    .filter((s) => s?.active === true && typeof s.email === "string")
    .map((s) => s.email.trim().toLowerCase()));
  const from = ["avisos@consulado.app", process.env.MAIL_FROM_ADDRESS?.trim().toLowerCase()]
    .find((email) => email && activos.has(email));
  if (!r.ok || !from) throw new Error("Sin remitente verificado.");
  const payload = {
    sender: { email: from, name: cfg.remitente },
    replyTo: { email: cfg.replyTo, name: cfg.remitente },
    to: [{ email: para }],
    subject: `[PRUEBA] ${cfg.asunto}`,
    textContent: cfg.texto,
    htmlContent,
    tags: ["consulado-madrid-prueba"],
  };
  iniciada = true;
  const envio = await api("/smtp/email", payload);
  const resultado = await envio.json();
  const messageId = resultado.messageId;
  if (!envio.ok || typeof messageId !== "string" || !/^<?[A-Za-z0-9_.+@-]{1,200}>?$/.test(messageId)) {
    const codigo = typeof resultado.code === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(resultado.code) ? resultado.code : null;
    console.log(JSON.stringify({ aceptado: envio.ok || envio.status >= 500 ? null : false, http: envio.status, codigo }));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ aceptado: true, messageId, desde: from, replyTo: cfg.replyTo }));
    let evento = "pendiente";
    for (const demora of [0, 3500, 6500, 9000]) {
      await esperar(demora);
      try {
        const q = new URLSearchParams({ messageId, days: "2", limit: "50" });
        const acuse = await api(`/smtp/statistics/events?${q}`);
        const datos = await acuse.json();
        const estados = (Array.isArray(datos.events) ? datos.events : [])
          .filter((e) => e.email?.toLowerCase() === para && e.messageId?.replace(/[<>]/g, "") === messageId.replace(/[<>]/g, ""))
          .map((e) => e.event);
        if (estados.includes("delivered")) { evento = "entregado"; break; }
        if (estados.some((e) => ["hardBounce", "blocked", "invalid", "error"].includes(e))) { evento = "fallido"; break; }
      } catch {
        // Una consulta de seguimiento fallida no cambia la aceptación del correo.
      }
    }
    console.log(JSON.stringify({ evento }));
  }
} catch {
  console.log(JSON.stringify({ aceptado: iniciada ? null : false, error: iniciada ? "RESPUESTA_INCIERTA" : "BREVO_NO_DISPONIBLE" }));
  process.exitCode = 1;
}
