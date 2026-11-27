import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout as esperar } from "node:timers/promises";
import { gunzipSync } from "node:zlib";

const archivo = "/run/cne-padron-movil/cne-sms-juntas-39235-20261127/diario.ndjson";
const clave = readFileSync("sms.key", "utf8").trim();
const entrada = gunzipSync(readFileSync("lote.json.gz"));
const huella = createHash("sha256").update(entrada).digest("hex");
const filas = JSON.parse(entrada);
const remitente = "34913430250";
const gsm = new Set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà");
const extension = new Set("^{}\\[~]|€\f");
const peso = texto => [...texto].reduce((n,c)=>n+(gsm.has(c)?1:extension.has(c)?2:1000),0);
if (!clave || huella !== "6577ceecfeb5e69195a8a29f09d78e821230ae5af83ffc7df3d01294e7c2e401" || !Array.isArray(filas) || filas.length !== 39235 ||
    new Set(filas.map(r=>r.to)).size !== filas.length ||
    filas.some(r => !/^34[67]\d{8}$/.test(r.to) || typeof r.text !== "string" || peso(r.text) > 160 ||
      !["prioridad","Zaragoza","Toledo","Madrid"].includes(r.grupo) || !r.text.includes("Su junta es la ")))
  throw Error("La lista no coincide con la lista aprobada.");

mkdirSync(dirname(archivo), { mode:0o700,recursive:true });
const historial = existsSync(archivo) ? readFileSync(archivo,"utf8").trimEnd().split("\n").map(s=>JSON.parse(s)) : [];
if (historial.length && (historial[0].evento!=="lista" || historial[0].huella!==huella))
  throw Error("El diario no corresponde a la lista aprobada.");
const fd = openSync(archivo,"a",0o600);
const grabar = (evento, datos={}) => {
  appendFileSync(fd, JSON.stringify({evento,at:new Date().toISOString(),...datos})+"\n");
  fsyncSync(fd);
};
if (!historial.length) grabar("lista",{huella,filas:filas.length});
const intentados = new Set(historial.filter(e=>e.evento==="solicitud").flatMap(e=>e.indices));
const pendientes = filas.flatMap((fila,i)=>intentados.has(i+1)?[]:[{...fila,indice:i+1}]);
const identificador = i => "CNE29NJ39235-" + String(i).padStart(5,"0");
const codigo = valor => typeof valor==="string" && /^[A-Za-z0-9_-]{1,65}$/.test(valor) ? valor : null;
const bloqueo = new Set(["NOT_ENOUGH_BALANCE","INSUFFICIENT_BALANCE","INVALID_SENDER","INVALID_TEXT","UNAUTHORIZED","INVALID_API_KEY"]);
async function api(ruta,body={},espera=12000) {
  const r=await fetch("https://api.gateway360.com/api/3.0/"+ruta,{
    method:"POST",redirect:"error",signal:AbortSignal.timeout(espera),
    headers:{"content-type":"application/json",accept:"application/json"},
    body:JSON.stringify({api_key:clave,...body}),
  });
  return {http:r.status,json:await r.json()};
}
async function presupuesto() {
  const [saldo,tarifa] = await Promise.all([
    api("account/get-balance"),
    api("account/pricing/sms/get-country-pricing",{country_code:"ES"}),
  ]);
  const dinero=Number(saldo.json.result?.balance);
  const precios=Object.values(tarifa.json.result?.ES?.networks??{}).map(x=>Number(x.price));
  if (saldo.http!==200 || saldo.json.status!=="ok" || saldo.json.result?.currency!=="EUR" ||
      !Number.isFinite(dinero) || dinero<0 || tarifa.http!==200 || tarifa.json.status!=="ok" ||
      !precios.length || !precios.every(n=>Number.isFinite(n)&&n>0)) throw Error("Saldo o tarifa no verificables.");
  const precio=Math.max(...precios);
  const micros=Math.ceil(precio*1e6-1e-7);
  return {saldo:dinero,precio,capacidad:Math.floor(Math.floor(dinero*1e6+1e-7)/micros)};
}

try {
  const quote=await presupuesto();
  let restantes=Math.min(quote.capacidad,pendientes.length);
  console.log(JSON.stringify({evento:"inicio",capacidad:restantes,pendientes:pendientes.length}));
  grabar("presupuesto",quote);
  let posicion=0,aceptados=0,rechazados=0,inciertos=0,consecutivos=0;
  while (restantes>0 && posicion<pendientes.length) {
    const grupo=pendientes[posicion].grupo;
    const lote=pendientes.slice(posicion,posicion+Math.min(400,restantes)).filter(r=>r.grupo===grupo);
    const indices=lote.map(r=>r.indice);
    const id=randomUUID();
    grabar("solicitud",{id,grupo,indices});
    let r;
    let resultados;
    try {
      r=await api("sms/send",{encoding:"GSM7",concat:0,
        messages:lote.map(({to,text,indice})=>({from:remitente,to,text,custom:identificador(indice)}))},27000);
      const respuestas=r.json.result;
      if (r.http===200 && r.json.status==="ok" && Array.isArray(respuestas) && respuestas.length===lote.length &&
          respuestas.every((x,i)=>x && (!x.custom || x.custom===identificador(indices[i])))) {
        resultados=respuestas.map((fila,i)=>{
          const ref=codigo(fila.sms_id);
          if(fila.status==="ok"&&ref)return {indice:indices[i],estado:"aceptado",ref};
          if(fila.status==="error"&&!fila.sms_id)return {indice:indices[i],estado:"rechazado",causa:codigo(fila.error_id)};
          return {indice:indices[i],estado:"incierto"};
        });
      }
    } catch { /* La solicitud puede haber llegado pese al fallo de transporte. */ }
    if (!resultados) {
      grabar("conciliar",{id,http:r?.http??null,causa:codigo(r?.json?.error_id)});
      inciertos+=lote.length;
      consecutivos++;
    } else {
      grabar("respuesta",{id,resultados});
      const confirmados=resultados.filter(x=>x.estado==="aceptado").length;
      aceptados+=confirmados;
      rechazados+=resultados.filter(x=>x.estado==="rechazado").length;
      inciertos+=resultados.filter(x=>x.estado==="incierto").length;
      consecutivos=confirmados>0?0:consecutivos+1;
    }
    posicion+=lote.length;
    restantes-=lote.length;
    console.log(JSON.stringify({ref:indices[0],grupo,solicitados:lote.length,aceptados,rechazados,inciertos}));
    if (consecutivos>=2 || bloqueo.has(codigo(r?.json?.error_id)) ||
        resultados?.some(x=>bloqueo.has(x.causa))) break;
    if (restantes>0 && posicion<pendientes.length) await esperar(350);
  }
  try { grabar("presupuesto_final",await presupuesto()); } catch { /* Los acuses ya quedaron guardados. */ }
  grabar("fin",{aceptados,rechazados,inciertos,nuevosIntentos:posicion});
} catch {
  grabar("detenido",{motivo:"No se pudo completar la operación. Consulte el diario antes de reanudar."});
  process.exitCode=1;
} finally {
  closeSync(fd);
}
