import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as esperar } from "node:timers/promises";
import { gunzipSync } from "node:zlib";

const modo = process.argv[2];
const llave = process.env.BREVO_API_KEY?.trim();
const idCampana = "Madrid · Mailing electoral · 29-11-2026";
const atributo = "CNE_MADRID_29N";
const remitente = "avisos@consulado.app";
const replyTo = "cecumadrid@cancilleria.gob.ec";
const enviadosEsperados = 10000;
const asunto = '{{ contact.CNE_MADRID_29N|default:"Compatriota" }}, este domingo Ecuador también cuenta con tu voto';
const saludo = 'Hola, {% if contact.CNE_MADRID_29N == "Compatriota" %}compatriota{% else %}{{ contact.CNE_MADRID_29N|default:"compatriota" }}{% endif %}:';
const huellaEsperada = "984a60789504572aa1b3a988f380318245aa7a26cf15f9c769c6cbc8d91cfa94";
const huella = (contactos) => createHash("sha256").update(contactos.map(({email,nombre}) => email + "\t" + nombre).sort().join("\n")).digest("hex");
const salida = datos => console.log(JSON.stringify(datos));
class Control extends Error {}
function exigir(ok, causa) { if (!ok) throw new Control(causa); }

async function api(path, method = "GET", datos) {
  const r = await fetch(`https://api.brevo.com/v3${path}`, {
    method, headers: { "api-key": llave, accept: "application/json", ...(datos && {"content-type":"application/json"}) },
    ...(datos && {body: JSON.stringify(datos)}), redirect:"error", signal:AbortSignal.timeout(25000),
  });
  const json = r.status === 204 ? {} : await r.json();
  if (!r.ok) {
    const codigo = typeof json.code === "string" && /^[a-z_0-9]{2,60}$/i.test(json.code) ? json.code : null;
    salida({ operacion:path.split("?")[0], http:r.status, codigo });
    throw new Control("Brevo devolvió un error.");
  }
  return json;
}

async function lista(crear) {
  const p = await api("/contacts/lists?limit=50");
  exigir(p.count <= 50 && Array.isArray(p.lists), "No se pudo verificar el conjunto de listas.");
  const existentes = p.lists.filter(l => l.name === idCampana);
  exigir(existentes.length <= 1, "Hay más de una lista con el mismo nombre.");
  const r = existentes[0] ?? (crear ? await api("/contacts/lists","POST",{ name:idCampana, folderId:p.lists[0]?.folderId }) : null);
  exigir(Number.isSafeInteger(r?.id) && r.id > 0, "No se encontró la lista de Madrid.");
  return r.id;
}

async function contactosDeLista(id) {
  const contactos = [];
  for (let offset = 0; offset < enviadosEsperados; ) {
    const pagina = await api(`/contacts/lists/${id}/contacts?limit=500&offset=${offset}`);
    exigir(Array.isArray(pagina.contacts) && Number.isSafeInteger(pagina.count) && pagina.count <= enviadosEsperados, "Recuento inesperado en la lista.");
    contactos.push(...pagina.contacts);
    if (!pagina.contacts.length || contactos.length >= pagina.count) break;
    offset += pagina.contacts.length;
  }
  exigir(contactos.every(c=>typeof c.email === "string" && typeof c.emailBlacklisted === "boolean"), "Respuesta de contactos incompleta.");
  return contactos.map(c=>({email:c.email.toLowerCase(),nombre:c.attributes?.[atributo] ?? "",bloqueado:c.emailBlacklisted}));
}

async function verificarLista(id) {
  const final = await contactosDeLista(id);
  const bloqueados = final.filter(x=>x.bloqueado).length;
  exigir(final.length === enviadosEsperados && huella(final) === huellaEsperada && bloqueados < enviadosEsperados,
    "La lista o los nombres guardados no coinciden con el CSV.");
  salida({ lista:id, contactos:final.length, genericos:final.filter(x=>!x.nombre || x.nombre==="Compatriota").length, excluidosPorBrevo:bloqueados });
}

async function importar(id) {
  const datos = JSON.parse(readFileSync("destinos.json","utf8"));
  exigir(Array.isArray(datos) && datos.length===enviadosEsperados && huella(datos)===huellaEsperada, "Paquete de contactos incorrecto.");
  const { attributes } = await api("/contacts/attributes");
  exigir(Array.isArray(attributes), "No se pudo consultar el atributo.");
  const previa = attributes.find(x=>x.name===atributo);
  if (!previa) await api(`/contacts/attributes/normal/${atributo}`,"POST",{type:"text"});
  else exigir(previa.type==="text" && previa.category==="normal","Atributo previo incompatible.");
  const actuales = new Map((await contactosDeLista(id)).map(x=>[x.email,x.nombre]));
  const pendientes = datos.filter(x=>actuales.get(x.email)!==x.nombre);
  for (let i=0;i<pendientes.length;i+=2000) {
    const trozo=pendientes.slice(i,i+2000);
    const {processId}=await api("/contacts/import","POST",{
      jsonBody:trozo.map(({email,nombre})=>({email, ...(nombre && {attributes:{[atributo]:nombre}})})),
      listIds:[id],updateExistingContacts:true,emptyContactsAttributes:false,disableNotification:true,
    });
    exigir(Number.isSafeInteger(processId) && processId>0, "No se confirmó la importación.");
    let estado;
    for(let intento=0;intento<40;intento++){
      estado=(await api(`/processes/${processId}`)).status;
      if(!["queued","in_process","processing"].includes(estado))break;
      await esperar(2500);
    }
    salida({ proceso:processId, estado, contactos:trozo.length });
    exigir(estado==="completed","Un bloque de contactos quedó sin verificar.");
  }
  await verificarLista(id);
}

function plantilla() {
  const fuente = readFileSync("mailing-madrid.html","utf8");
  const cierre = '</table>\n<!--[if mso]></td></tr></table><![endif]-->';
  const baja = '<tr><td class="margen" style="padding:10px 26px;color:#44596a;font-size:12px;"><a href="{{ unsubscribe }}" style="color:#44596a;">Darme de baja de estos correos</a></td></tr>';
  exigir(fuente.includes("Hola, Jorge:") && fuente.includes(cierre), "No se encontró la prueba revisada.");
  return fuente.replace("Hola, Jorge:",saludo).replace("Jorge, este domingo Ecuador también cuenta con tu voto",idCampana).replace(cierre,baja+"\n"+cierre);
}

async function campana(id, crear=false) {
  const p=await api("/emailCampaigns?type=classic&limit=50&excludeHtmlContent=true");
  exigir(Array.isArray(p.campaigns),"No se pudo consultar campañas.");
  const existentes=p.campaigns.filter(c=>c.name===idCampana);
  exigir(existentes.length<=1,"Hay más de una campaña con el mismo nombre.");
  const n = existentes[0]?.id ?? (crear ? (await api("/emailCampaigns","POST",{
    name:idCampana, subject:asunto, sender:{email:remitente,name:"Consulado General del Ecuador en Madrid"},
    replyTo, recipients:{listIds:[id]},htmlContent:plantilla(),inlineImageActivation:false,
  })).id:null);
  exigir(Number.isSafeInteger(n) && n>0,"No se encontró la campaña de Madrid.");
  if (crear && existentes.length) {
    const borrador=await api(`/emailCampaigns/${n}`);
    exigir(borrador.status==="draft" && !borrador.scheduledAt,"El borrador ya se está enviando.");
    await api(`/emailCampaigns/${n}`,"PUT",{htmlContent:plantilla()});
  }
  return n;
}

async function verificarCampana(id,n) {
  const c=await api(`/emailCampaigns/${n}?statistics=globalStats`);
  const r=c.recipients;
  const g=c.statistics?.globalStats;
  const html=c.htmlContent;
  const coincide=c.name===idCampana && c.subject===asunto && c.replyTo===replyTo &&
    (c.sender?.email===remitente || c.sender?.id===2) && r?.lists?.length===1 && r.lists[0]===id &&
    !r.exclusionLists?.length && !r.segments?.length &&
    typeof html==="string" && html.includes(atributo) && html.includes("unsubscribe") &&
    html.includes("== \"Compatriota\"") && html.includes("3 papeletas para elegir al CPCCS") && html.includes("Tu voto es secreto");
  salida({ campana:n, lista:id, estado:c.status, configuracion:coincide,
    replyTo:c.replyTo===replyTo ? replyTo:null, enviados:g?.sent, entregados:g?.delivered,
    rebotesDuros:g?.hardBounces, rebotesBlandos:g?.softBounces });
  exigir(coincide,"La configuración de la campaña no coincide.");
  return c;
}

function leerCsv(linea, separador) {
  const celdas = [];
  let valor = "", entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"' && entreComillas && linea[i + 1] === '"') {
      valor += '"';
      i++;
    } else if (c === '"') entreComillas = !entreComillas;
    else if (c === separador && !entreComillas) {
      celdas.push(valor);
      valor = "";
    } else valor += c;
  }
  celdas.push(valor);
  return celdas;
}

async function auditar(id,n) {
  const contactos = await contactosDeLista(id);
  const esperados = new Set(contactos.map(x=>x.email));
  exigir(esperados.size===enviadosEsperados && huella(contactos)===huellaEsperada, "La lista no coincide con la que se verificó antes del envío.");
  const { processId } = await api(`/emailCampaigns/${n}/exportRecipients`,"POST",{recipientsType:"all"});
  exigir(Number.isSafeInteger(processId) && processId>0,"No se confirmó la exportación.");
  for(let i=0;i<15;i++){
    const p=await api(`/processes/${processId}`);
    if(p.status==="completed"){
      if(!p.export_url){
        salida({auditoria:"Brevo no devolvió el archivo",proceso:processId});
        return;
      }
      const url=new URL(p.export_url);
      const permitido=url.protocol==="https:" && !url.username && !url.password && (
        /(^|\.)(brevo\.com|sendinblue\.com|sib\.(fr|com)|sendibm[0-9]*\.com|amazonaws\.com|cloudfront\.net|storage\.googleapis\.com)$/.test(url.hostname));
      if(!permitido){
        salida({auditoria:"Dominio del archivo pendiente de verificar",dominio:url.hostname});
        return;
      }
      const archivo=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(25000)});
      exigir(archivo.ok,"Brevo no pudo entregar el archivo de destinatarios.");
      let bytes=Buffer.from(await archivo.arrayBuffer());
      if(bytes[0]===0x1f && bytes[1]===0x8b)bytes=gunzipSync(bytes);
      const decodificar=bytes[0]===0xff && bytes[1]===0xfe ? "utf16le" : "utf8";
      const lineas=bytes.toString(decodificar).replace(/^\uFEFF/,"").trimEnd().split(/\r?\n/);
      const normalizar=s=>s.trim().toLowerCase().replace(/[^a-z]/g,"");
      let columnas=null;
      for(let fila=0;fila<Math.min(10,lineas.length)&&!columnas;fila++){
        for(const sep of [",",";","\t","|"]){
          const index=leerCsv(lineas[fila],sep).findIndex(h=>["email","emailaddress","emailid","recipient","recipientemail","correoelectrnico"].includes(normalizar(h)));
          if(index>=0){columnas={sep,index,fila};break;}
        }
      }
      if(!columnas){
        const meta=lineas.slice(0,2).map(l=>l.replace(/\S*@\S*|https?:\/\/\S+/g,"[omitido]").replace(/[^A-Za-z0-9;, _:.=<>\t|"-]/g,"").slice(0,140));
        salida({auditoria:"Formato no reconocido",tipo:archivo.headers.get("content-type"),bytes:bytes.length,lineas:lineas.length,meta});
        return;
      }
      const correos=lineas.slice(columnas.fila+1).filter(l=>l.trim()).map(l=>leerCsv(l,columnas.sep)[columnas.index]?.trim().toLowerCase());
      exigir(correos.every(e=>typeof e==="string"&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)),"La exportación contiene filas no reconocidas.");
      const unicos=new Set(correos);
      salida({ auditoria:true, filas:correos.length, unicos:unicos.size, repetidos:correos.length-unicos.size,
        fueraDeLaLista:[...unicos].filter(e=>!esperados.has(e)).length,
        deLaLista:[...unicos].filter(e=>esperados.has(e)).length });
      return;
    }
    if(!["queued","in_process","processing"].includes(p.status)){
      salida({auditoria:"Exportación no disponible",estado:p.status});
      return;
    }
    await esperar(3000);
  }
  salida({auditoria:"Exportación pendiente",proceso:processId});
}

try {
  exigir(llave && ["importar","enviar","consultar","auditar"].includes(modo),"Modo o clave ausentes.");
  const id = await lista(modo==="importar");
  if(modo==="importar") await importar(id);
  if(modo==="enviar") await verificarLista(id);
  const n = await campana(id,modo==="importar");
  const c=await verificarCampana(id,n);
  if(modo==="auditar") await auditar(id,n);
  if(modo==="enviar"){
    exigir(c.status==="draft" && !c.scheduledAt,"La campaña ya salió o está programada.");
    await api(`/emailCampaigns/${n}/sendNow`,"POST");
    salida({ campanaEnCola:n });
  }
  if(modo==="enviar" || modo==="consultar"){
    for(let i=0;i<12;i++){
      const st=await verificarCampana(id,n);
      if(["sent","suspended","canceled","cancelled"].includes(st.status))break;
      if(i<11)await esperar(10000);
    }
  }
} catch(e) {
  salida({ error:e instanceof Control ? e.message : "Operación sin confirmar. Compruebe Brevo antes de reintentar." });
  process.exitCode=1;
}
