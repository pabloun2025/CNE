// Registra solo el webhook de CNE y recupera sus eventos anteriores. No envía correos.
import { setTimeout as esperar } from "node:timers/promises";
import { closePools, query } from "../../src/server/db";
import { claveWebhookBrevo, registrarEventoBrevo } from "../../src/server/envios/brevo-webhook";
import { pedirJson } from "../../src/server/envios/http";
import { requiredEnv } from "../../src/server/env";

async function api(ruta: string, method = "GET", body?: object, reintentos = 2): Promise<unknown> {
  const r = await pedirJson(undefined, `https://api.brevo.com/v3${ruta}`, {
    method, body, headers: { "api-key": requiredEnv("BREVO_API_KEY") }, timeoutMs: 25000,
  });
  if (r.kind !== "response") throw new Error("Brevo no respondió.");
  if (r.status === 429 && method === "GET" && reintentos > 0) {
    await esperar(1500);
    return api(ruta, method, body, reintentos - 1);
  }
  if (r.status < 200 || r.status >= 300) throw new Error(`Brevo respondió HTTP ${r.status} en ${ruta.split("?")[0]}.`);
  return r.json;
}

async function configurar() {
  const url = new URL("/api/webhooks/brevo", `https://${requiredEnv("HOST_MADRID")}`).toString();
  const token = claveWebhookBrevo();
  const acceso = await fetch(url, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: "{}", signal: AbortSignal.timeout(15000),
  });
  if (acceso.status !== 200) throw new Error(`El webhook de CNE respondió HTTP ${acceso.status}.`);

  const lista = await api("/webhooks?type=transactional") as { webhooks?: { id: number; url: string }[] } | null;
  if (!Array.isArray(lista?.webhooks)) throw new Error("Brevo no devolvió la lista de webhooks.");
  const actuales = lista.webhooks.filter((w) => w.url === url);
  if (actuales.length > 1) throw new Error("Brevo tiene más de un webhook con la URL de CNE.");
  const datos = {
    url, description: "CNE Madrid · entregas de credenciales", batched: false,
    events: ["request", "delivered", "hardBounce", "softBounce", "blocked", "spam", "invalid", "deferred"],
    auth: { type: "bearer", token },
  };
  await (actuales[0] ? api(`/webhooks/${actuales[0].id}`, "PUT", datos) : api("/webhooks", "POST", { ...datos, type: "transactional", channel: "email" }));
  const registro = await api("/webhooks?type=transactional") as { webhooks?: { url: string; events?: string[]; auth?: { type?: string }; batched?: boolean }[] } | null;
  const guardado = registro?.webhooks?.find((w) => w.url === url);
  if (!guardado?.events?.includes("delivered") || guardado.batched === true || (guardado.auth?.type && guardado.auth.type !== "bearer")) {
    throw new Error("Brevo no confirmó la configuración del webhook de CNE.");
  }
  console.log("Webhook de CNE registrado con autenticación y eventos de entrega.");
}

async function recuperarHistorial() {
  const limit = 250;
  let actualizados = 0;
  let consultados = 0;
  async function importar(parametros: Record<string, string>) {
    for (let offset = 0; ; offset += limit) {
      const params = new URLSearchParams({ ...parametros, days: "90", sort: "asc", limit: String(limit), offset: String(offset) });
      const r = await api(`/smtp/statistics/events?${params}`) as { events?: unknown[] } | null;
      const eventos = r?.events ?? [];
      if (!Array.isArray(eventos)) throw new Error("Brevo devolvió un formato de historial inesperado.");
      for (const e of eventos) {
        if (await registrarEventoBrevo(e, true)) actualizados++;
      }
      consultados += eventos.length;
      if (eventos.length < limit) break;
    }
  }
  await importar({ tags: JSON.stringify(["cne-madrid"]) });
  // Brevo puede omitir eventos al filtrar por etiqueta. Consulte los mensajes de CNE aún sin resultado.
  const pendientes = await query<{ id_externo: string }>(
    `SELECT DISTINCT id_externo FROM envios_credencial
      WHERE canal = 'correo' AND NOT simulado AND mjrv_id IS NOT NULL AND id_externo IS NOT NULL
        AND (brevo_estado IS NULL OR brevo_estado IN ('aceptado','diferido'))`,
  );
  for (const { id_externo } of pendientes) await importar({ messageId: id_externo });
  const recuento = await query(
    `SELECT CASE WHEN canal = 'correo' THEN coalesce(brevo_estado, estado) ELSE estado END AS estado, canal, count(*)::int AS n
       FROM envios_credencial e JOIN mjrv m ON m.id = e.mjrv_id
      WHERE NOT simulado AND m.activo AND NOT m.es_prueba
        AND e.id = (SELECT max(h.id) FROM envios_credencial h WHERE h.mjrv_id = m.id AND h.canal = e.canal AND NOT h.simulado)
      GROUP BY 1, 2 ORDER BY 2, 1`,
  );
  console.log("Seguimiento CNE " + JSON.stringify({ consultados, actualizados, recuento }));
}

void configurar().then(recuperarHistorial).catch((e: Error) => {
  console.error(e.message);
  process.exitCode = 1;
}).finally(closePools);
