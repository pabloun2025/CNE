import {readFileSync} from "node:fs";
const email=readFileSync("individual.txt","utf8").trim().toLowerCase();
const llave=process.env.BREVO_API_KEY?.trim();
if(!llave || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) process.exit(2);
async function api(ruta) {
  const r=await fetch(`https://api.brevo.com/v3${ruta}`,{
    headers:{"api-key":llave,accept:"application/json"},
    redirect:"error",signal:AbortSignal.timeout(12000),
  });
  if(!r.ok){console.log(JSON.stringify({http:r.status}));throw new Error("Consulta fallida");}
  return r.json();
}
try{
 const c=await api(`/contacts/${encodeURIComponent(email)}`);
 if(!Number.isSafeInteger(c.id) || c.email?.toLowerCase()!==email){console.log(JSON.stringify({contacto:"no confirmado"}));process.exit(1);}
 const e=await api(`/contacts/${c.id}/campaignStats?startDate=2026-11-26&endDate=2026-11-27`);
 const evento=(k)=>e[k]?.some(x=>x.campaignId===2)===true;
 console.log(JSON.stringify({campana:2,enLista:c.listIds?.includes(6),nombre:c.attributes?.CNE_MADRID_29N ?? null,
   enviado:evento("messagesSent"),entregado:evento("delivered"),abierto:evento("opened"),rebote:evento("hardBounces")||evento("softBounces")}));
}catch{process.exitCode=1;}
