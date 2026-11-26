import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as esperar } from "node:timers/promises";

const apiKey = process.env.API_SMSQUEENS?.trim();
const modo = process.env.CNE_SMS_MODO;
const total = 9498;
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
    signal: AbortSignal.timeout(ruta === "sms/send-landing" ? 50000 : 11000),
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
  const costeMaximo = Math.ceil((total - (modo === "continuar" ? 1000 : 0)) * tarifaMaxima * 100) / 100;
  const pruebasEstado = Object.fromEntries(pruebas.map(([nombre, id], i) => [nombre,
    codigo(acuses[i]?.json?.result?.find?.((fila) => fila.sms_id === id)?.status) ?? "PENDIENTE"]));
  console.log(JSON.stringify({ saldo, moneda, tarifaMinima, tarifaMaxima, costeMaximo, total, pruebas: pruebasEstado }));
  exigir(moneda === "EUR" && saldo >= costeMaximo, "Saldo insuficiente o moneda no verificable para todo el lote.");
}

async function ejecutar() {
  const lista = readFileSync("lista.txt", "utf8");
  const numeros = lista.trimEnd().split("\n");
  exigir(numeros.length === total && new Set(numeros).size === total && numeros.every(n => /^34[67]\d{8}$/.test(n)), "La lista no coincide con el recuento de móviles únicos.");
  exigir(createHash("sha256").update(lista).digest("hex") === "20cfce2a1daa99211ae59066c88ffc7df9deba1e86387cab38598b483dfaa8fa", "La huella de la lista no coincide con el CSV validado.");
  const primerPendiente = modo === "continuar" ? 1000 : 0;
  const limite = 200;
  const inicios = [];
  for (let inicio = primerPendiente; inicio < numeros.length; inicio += limite) inicios.push(inicio);
  const causas = {};
  let aceptados = 0, rechazados = 0;

  async function procesar(inicio) {
    const messages = numeros.slice(inicio, inicio + limite).map((to, i) => ({
      from: "+34913430250", to, text: texto, custom: `CNE29NC1-${String(inicio + i + 1).padStart(5,"0")}`,
    }));
    console.log(JSON.stringify({ inicio: inicio + 1, solicitados: messages.length }));
    const envio = await api("sms/send-landing", { landing_id: 215041, campaign_name: "Madrid 29N · Primer envío", encoding: "GSM7", concat: 0, messages });
    const respuestas = envio.json.result;
    if (envio.http !== 200 || envio.json.status !== "ok" || !Array.isArray(respuestas) || respuestas.length !== messages.length) {
      return { inicio: inicio + 1, solicitados: messages.length, incierto: true, http: envio.http, error: codigo(envio.json.error_id) };
    }
    let ok = 0, fallo = 0;
    for (const [i, r] of respuestas.entries()) {
      exigir(!r.custom || r.custom === messages[i].custom, "Referencias incompatibles.");
      if (r.status === "ok" && typeof r.sms_id === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(r.sms_id)) {
        ok++;
      } else {
        exigir(r.status === "error" && !r.sms_id, "Estado incierto.");
        fallo++;
        const causa = codigo(r.error_id) ?? "SIN_CODIGO";
        causas[causa] = (causas[causa] ?? 0) + 1;
        console.log(JSON.stringify({ rechazado: messages[i].custom, causa }));
      }
    }
    return { inicio: inicio + 1, aceptados: ok, rechazados: fallo };
  }

  for (let i = 0; i < inicios.length; i += 4) {
    const wave = inicios.slice(i, i + 4);
    const resultados = await Promise.all(wave.map(inicio => procesar(inicio).catch(() => ({
      inicio: inicio + 1, solicitados: Math.min(limite, total - inicio), incierto: true,
    }))));
    for (const r of resultados) {
      aceptados += r.aceptados ?? 0;
      rechazados += r.rechazados ?? 0;
      console.log(JSON.stringify(r));
    }
    const hayRechazoGeneral = Object.keys(causas).some(c => ["NOT_ENOUGH_BALANCE", "INVALID_LANDING", "INVALID_SENDER", "INVALID_TEXT", "UNAUTHORIZED"].includes(c));
    if (resultados.some(r => r.incierto || r.aceptados === 0) || hayRechazoGeneral) {
      console.log(JSON.stringify({ final: false, aceptados, rechazados, causas }));
      throw new Control("Conciliar la última tanda antes de continuar.");
    }
    if (i + 4 < inicios.length) await esperar(200);
  }
  console.log(JSON.stringify({ final: true, primerPendiente, total, aceptados, rechazados, causas }));
}

async function reconciliar() {
  const saldo = await api("account/get-balance");
  console.log(JSON.stringify({ saldoActual: saldo.json.result?.balance ?? null, moneda: saldo.json.result?.currency ?? null }));
  const referencias = ["CNE29NC1-00001", "CNE29NC1-00002", "CNE29NC1-00100", "CNE29NC1-00500", "CNE29NC1-01000"];
  const informes = await Promise.all(referencias.map((custom) => api("sms/get-reports", { custom })));
  const ejemplos = informes.map((r, i) => ({ referencia: referencias[i], http: r.http, cantidad: r.json.result?.length ?? null, estados: r.json.result?.map(v => codigo(v.status)) }));
  const porFecha = await api("sms/get-reports", { from_date: "2026-11-26 21:00:00", to_date: "2026-11-27 01:00:00", page: 1 });
  const filas = porFecha.json.result;
  console.log(JSON.stringify({ ejemplos, porFecha: { http: porFecha.http, cantidad: filas?.length ?? null, delLote: filas?.filter?.(r => /^CNE29NC1-/.test(r.custom ?? "")).length ?? null } }));
}

try {
  exigir(apiKey && ["comprobar", "enviar", "continuar", "reconciliar"].includes(modo), "Modo o clave ausentes.");
  if (modo === "reconciliar") await reconciliar();
  else {
    await comprobar();
    if (["enviar","continuar"].includes(modo)) await ejecutar();
  }
} catch (e) {
  console.error(e instanceof Control ? e.message : "La operación no pudo confirmarse. Revise el registro y el panel antes de repetir.");
  process.exitCode = 1;
}
