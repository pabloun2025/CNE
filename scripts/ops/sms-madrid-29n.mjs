import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as esperar } from "node:timers/promises";

const apiKey = process.env.API_SMSQUEENS?.trim();
const modo = process.env.CNE_SMS_MODO;
const total = 29786;
const texto = "Compatriota, este domingo 29 son las elecciones de Ecuador. Votemos en Madrid con el orgullo de ser ecuatorianos. Revisa donde votar: {LANDING}";
const pruebas = [
  ["Justina", "62ba425a8e59413783d1dff8734f3930"],
  ["Pablo", "ba61e7ae931644fa8eb8987203e7805e"],
];
const codigo = v => typeof v === "string" && /^[A-Z0-9_]{1,60}$/.test(v) ? v : null;

class Control extends Error {}
function exigir(condicion, causa) { if (!condicion) throw new Control(causa); }

async function api(ruta, body = {}) {
  const r = await fetch(`https://api.gateway360.com/api/3.0/${ruta}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ api_key: apiKey, ...body }),
    redirect: "error",
    signal: AbortSignal.timeout(ruta === "sms/send-landing" ? 30000 : 11000),
  });
  return { http: r.status, json: await r.json() };
}

async function comprobar() {
  const [balance, tarifas, ...acuses] = await Promise.all([
    api("account/get-balance"),
    api("account/pricing/sms/get-country-pricing", { country_code: "ES" }),
    ...pruebas.map(([, sms_id]) => api("sms/get-reports", { sms_id }).catch(() => null)),
  ]);
  const saldo = Number(balance.json.result?.balance ?? NaN);
  const moneda = balance.json.result?.currency;
  exigir(balance.http === 200 && balance.json.status === "ok" && Number.isFinite(saldo), "Saldo no verificable.");
  const redes = tarifas.json.result?.ES?.networks;
  const precios = Object.values(redes ?? {}).map(({ price }) => Number(price));
  exigir(tarifas.http === 200 && tarifas.json.status === "ok" && precios.length && precios.every(p => Number.isFinite(p) && p > 0), "Tarifa de España no verificable.");
  const tarifaMinima = Math.min(...precios), tarifaMaxima = Math.max(...precios);
  const costeMaximo = Math.ceil(total * tarifaMaxima * 100) / 100;
  const pruebasEstado = Object.fromEntries(pruebas.map(([nombre, id], i) => [nombre,
    codigo(acuses[i]?.json?.result?.find?.((fila) => fila.sms_id === id)?.status) ?? "PENDIENTE"]));
  console.log(JSON.stringify({ saldo, moneda, tarifaMinima, tarifaMaxima, costeMaximo, total, pruebas: pruebasEstado }));
  exigir(moneda === "EUR" && saldo >= costeMaximo, "Saldo insuficiente o moneda no verificable para todo el lote.");
}

async function ejecutar() {
  const lista = readFileSync("lista.txt", "utf8");
  const numeros = lista.trimEnd().split("\n");
  exigir(numeros.length === total && new Set(numeros).size === total && numeros.every(n => /^34[67]\d{8}$/.test(n)), "La lista no coincide con el recuento de móviles únicos.");
  exigir(createHash("sha256").update(lista).digest("hex") === "d8142add27fef57f719f7e31eef8f71f5ce9c4857aed04d36a3aaa4c85a6f2c1", "La huella de la lista no coincide con el CSV validado.");
  let aceptados = 0, rechazados = 0;
  const causas = {};
  const limite = 1000;
  for (let inicio = 0; inicio < numeros.length; inicio += limite) {
    const lote = 1 + inicio / limite;
    const messages = numeros.slice(inicio, inicio + limite).map((to, i) => ({
      from: "+34913430250", to, text: texto, custom: `CNE29NP1-${String(inicio + i + 1).padStart(5,"0")}`,
    }));
    console.log(JSON.stringify({ lote, solicitados: messages.length, inicio: inicio + 1 }));
    let envio;
    try {
      envio = await api("sms/send-landing", { landing_id: 215041, campaign_name: "Madrid 29N · Primer envío", encoding: "GSM7", concat: 0, messages });
    } catch {
      throw new Control(`Resultado incierto en lote ${lote}. Buscar sus referencias en el panel antes de cualquier reintento.`);
    }
    const respuestas = envio.json.result;
    exigir(envio.http === 200 && envio.json.status === "ok" && Array.isArray(respuestas) && respuestas.length === messages.length,
      `El lote ${lote} requiere conciliación (HTTP ${envio.http}, ${codigo(envio.json.error_id) ?? "SIN_CODIGO"}).`);
    let ok = 0, fallo = 0;
    for (const [i, r] of respuestas.entries()) {
      if (r.custom && r.custom !== messages[i].custom) throw new Control(`Referencias incompatibles en lote ${lote}.`);
      if (r.status === "ok" && typeof r.sms_id === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(r.sms_id)) {
        ok++;
      } else {
        exigir(r.status === "error" && !r.sms_id, `Estado incierto en lote ${lote}.`);
        fallo++;
        const causa = codigo(r.error_id) ?? "SIN_CODIGO";
        causas[causa] = (causas[causa] ?? 0) + 1;
        console.log(JSON.stringify({ rechazado: messages[i].custom, causa }));
      }
    }
    aceptados += ok;
    rechazados += fallo;
    console.log(JSON.stringify({ lote, aceptados: ok, rechazados: fallo, totalAceptados: aceptados, totalRechazados: rechazados }));
    exigir(ok > 0 && !Object.keys(causas).some(c => ["NOT_ENOUGH_BALANCE", "INVALID_LANDING", "INVALID_SENDER", "INVALID_TEXT", "UNAUTHORIZED"].includes(c)),
      `Hay un rechazo general en el lote ${lote}. No se solicitaron los lotes posteriores.`);
    if (inicio + limite < numeros.length) await esperar(500);
  }
  console.log(JSON.stringify({ final: true, total, aceptados, rechazados, causas }));
}

try {
  exigir(apiKey && ["comprobar", "enviar"].includes(modo), "Modo o clave ausentes.");
  await comprobar();
  if (modo === "enviar") await ejecutar();
} catch (e) {
  console.error(e instanceof Control ? e.message : "La operación no pudo confirmarse. Revise el registro y el panel antes de repetir.");
  process.exitCode = 1;
}
