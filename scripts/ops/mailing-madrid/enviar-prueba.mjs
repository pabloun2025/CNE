import {readFileSync} from "node:fs";
const email=readFileSync("individual.txt","utf8").trim().toLowerCase();
const llave=process.env.BREVO_API_KEY?.trim();
if(!llave || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) process.exit(2);
async function api(ruta, etapa) {
  const r=await fetch(`https://api.brevo.com/v3${ruta}`,{
    headers:{"api-key":llave,accept:"application/json"},
    redirect:"error",signal:AbortSignal.timeout(12000),
  });
  if(!r.ok){const detalle=await r.json().catch(()=>({}));const mensaje=typeof detalle.message==="string" ? detalle.message.replaceAll(email,"[dirección]").replaceAll(encodeURIComponent(email),"[dirección]").slice(0,220) : null;console.log(JSON.stringify({etapa,http:r.status,codigo:detalle.code,mensaje}));throw new Error("Consulta fallida");}
  return r.json();
}
try{
 const c=await api(`/contacts/${encodeURIComponent(email)}`,"contacto");
 if(!Number.isSafeInteger(c.id) || c.email?.toLowerCase()!==email){console.log(JSON.stringify({contacto:"no confirmado"}));process.exit(1);}
 const ruta=`/contacts/${c.id}/campaignStats`;
 const e=await api(ruta+"?startDate=2026-11-25&endDate=2026-11-26","estadísticas").catch(()=>api(ruta,"estadísticas sin fechas"));
 const evento=(k)=>e[k]?.some(x=>Number(x.campaignId)===2)===true;
 console.log(JSON.stringify({campana:2,enLista:c.listIds?.includes(6),nombre:c.attributes?.CNE_MADRID_29N ?? null,
   enviado:evento("messagesSent"),entregado:evento("delivered"),abierto:evento("opened"),rebote:evento("hardBounces")||evento("softBounces")}));
}catch{process.exitCode=1;}
