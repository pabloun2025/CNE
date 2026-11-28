import { readFileSync } from "node:fs";
import { query, withTx, closePools } from "./src/server/db";
import { registrarAuditoria } from "./src/server/auditoria";
import { CLAVE_CANDADO_COLA } from "./src/server/envios/cola";
import { seleccionarParaCredencial, marcarGeneradas } from "./src/server/credenciales";
import { medidasCredencial } from "./src/server/credencial-config";
import { prepararContenidoEnvio } from "./src/server/envios/contenido";
import { clienteCorreo } from "./src/server/envios/brevo";
import { leerConfigEnvios, remitenteEfectivo } from "./src/server/envios-config";
import { tokenCredencialSms } from "./src/server/credencial-sms";
import { hashEnlaceSms, urlAcuseSms } from "./src/server/envios/sms-seguimiento";
import { mensajeSmsMadrid, remitenteSmsMadrid, enviarSmsPubli } from "./src/server/envios/sms-publi";

import { claveAcceso } from "./src/server/revocar-credencial";

const lote = "padron_madrid_20261128";
const mail = lote + "_correo";
const host = "madrid.consulado.app";
const expira = Date.parse("2026-11-29T23:59:00+01:00");
const fuente = "Padrón oficial de Madrid, 28-11-2026 11:21 CET";
type Entrada = { serie:"M"|"H"; num:number; rol:string; fila:number; cedula:string; apellidos:string; nombres:string; correo:string; telefono:string; cargo:string; anterior:string|null };
type Ficha = { id:number; activo:boolean; cedula:string; correo:string; telefono_e164:string; nombres:string; apellidos:string; cargo_original:string; junta_origen_id:number; rol:string; incorporado_en:string|null; es_prueba:boolean };
type Paquete = { cambios:Entrada[]; cedulas:string[] };
const rotulo = (d: Entrada) => (d.serie === "M" ? "F" : "M") + d.num;
const puesto = (d: Entrada) => rotulo(d) + ":" + d.rol;
const esperado = ["F14:secretario","F23:secretario","F25:vocal","F29:presidente","F40:presidente","F44:secretario","M1:presidente","M3:vocal","M16:secretario","M19:presidente","M22:presidente","M31:vocal","M32:presidente","M36:presidente","M39:secretario"];
class Control extends Error {}
function exigir(p: unknown, e: string): asserts p { if (!p) throw new Control(e); }
const cedula = (c: string) => c.padStart(10, "0");
const equivalentes = (c: string) => [c, c.replace(/^0+/, "")];

async function ajustar(d:Entrada, titulares:Set<string>, ejecutar:boolean) {
  return withTx(async tx => {
    await tx.query("SELECT pg_advisory_xact_lock($1)",[CLAVE_CANDADO_COLA]);
    const {rows:[cfg]} = await tx.query("SELECT modo FROM configuracion WHERE id=1 FOR UPDATE");
    exigir(cfg?.modo === "eleccion","CNE no está en elección");
    const {rows:[j]} = await tx.query("SELECT id FROM juntas_madrid WHERE serie=$1 AND numero=$2",[d.serie,d.num]);
    exigir(j,"Junta ausente");
    const {rows:fichas} = await tx.query<Ficha>(
      `SELECT id,activo,cedula,correo,telefono_e164,nombres,apellidos,cargo_original,junta_origen_id,rol,incorporado_en,es_prueba
        FROM mjrv WHERE (activo AND NOT es_prueba AND junta_origen_id=$1 AND rol=$2)
        OR cedula = ANY($3::text[]) ORDER BY id FOR UPDATE`, [j.id,d.rol,equivalentes(d.cedula)]);
    const homonimas = fichas.filter(m=>cedula(m.cedula)===d.cedula);
    exigir(homonimas.length<=1,"Más de una ficha con esa cédula");
    const actual = homonimas[0];
    exigir(!actual || (!actual.es_prueba && !actual.incorporado_en && actual.junta_origen_id===j.id && actual.rol===d.rol),"La persona nueva figura en otro puesto");
    const otras = fichas.filter(m => m.activo && m.id !== actual?.id);
    exigir(otras.length<=1,"Más de un ocupante activo");
    const anterior = otras[0];
    if (anterior) {
      exigir(!anterior.incorporado_en && !titulares.has(cedula(anterior.cedula)) &&
        (d.anterior===cedula(anterior.cedula) || puesto(d)==="F23:secretario"),"La ficha activa requiere cotejo adicional");
      const actividad = await tx.query(
        `SELECT 1 FROM v_actuacion_mesa WHERE mjrv_id=$1
         UNION ALL SELECT 1 FROM pagos_confirmados WHERE mjrv_id=$1
         UNION ALL SELECT 1 FROM firmas_recibo WHERE mjrv_id=$1`,[anterior.id]);
      exigir(!actividad.rowCount,"Hay actuación confirmada, firma o pago");
    }
    const rev = await tx.query("SELECT 1 FROM credenciales_revocadas WHERE cedula=ANY($1::text[]) OR mjrv_id=$2",[equivalentes(d.cedula),actual?.id ?? null]);
    exigir(!rev.rowCount,"La persona nueva tiene una revocación vigente");
    const cambio = !actual ? "alta" : actual.activo ? "actualizar" : "reactivar";
    const prevSms = actual ? (await tx.query("SELECT estado FROM envios_sms WHERE mjrv_id=$1 AND destino=$2",[actual.id,d.telefono])).rows[0]?.estado : undefined;
    if (!ejecutar) return { d, id:actual?.id, cambio, sustituye:!!anterior, previoSms:prevSms };
    if (anterior) {
      const claves = [...new Set([anterior.cedula,anterior.apellidos+anterior.nombres,anterior.nombres+anterior.apellidos].map(claveAcceso).filter(Boolean))];
      await tx.query(
        `INSERT INTO credenciales_revocadas(mjrv_id,cedula,apellidos,nombres,claves,actor_nombre)
         VALUES($1,$2,$3,$4,$5,'CNE · cotejo de padrón') ON CONFLICT DO NOTHING`,
        [anterior.id,anterior.cedula,anterior.apellidos,anterior.nombres,claves]);
      const revocada = await tx.query("SELECT 1 FROM credenciales_revocadas WHERE mjrv_id=$1 OR cedula=$2",[anterior.id,anterior.cedula]);
      exigir(revocada.rowCount,"No se pudo confirmar la revocación");
      await tx.query("UPDATE mjrv SET activo=false,baja_motivo=$2,actualizado_en=now() WHERE id=$1",[anterior.id,fuente+" · cargo reasignado"]);
      await tx.query("UPDATE envios_credencial SET estado='fallo',error='Cancelado por baja en el padrón de Madrid.' WHERE mjrv_id=$1 AND NOT simulado AND estado='en_cola' AND intentos=0",[anterior.id]);
      await registrarAuditoria({portal:"admin",actorTipo:"sistema",accion:lote+"_revocar",entidad:"mjrv",entidadId:anterior.id,datos:{puesto:puesto(d)}},tx);
    }
    let id = actual?.id;
    if (actual) {
      const modificado = !actual.activo || actual.cedula!==d.cedula || actual.nombres!==d.nombres || actual.apellidos!==d.apellidos ||
        actual.correo!==d.correo || actual.telefono_e164!==d.telefono || actual.cargo_original!==d.cargo;
      if (modificado) {
        await tx.query(
          `UPDATE mjrv SET activo=true,baja_motivo=NULL,cedula=$2,apellidos=$3,nombres=$4,cargo_original=$5,correo=$6,
           telefono_e164=$7,fuente_archivo=$8,fila_origen=$9,credencial_generada_en=NULL,actualizado_en=now() WHERE id=$1`,
          [id,d.cedula,d.apellidos,d.nombres,d.cargo,d.correo,d.telefono,fuente,d.fila]);
      } else if (!anterior) {
        return { d,id,cambio:"ya vigente",sustituye:false,previoSms:prevSms };
      }
    } else {
      const {rows:[m]}=await tx.query(
        `INSERT INTO mjrv(cedula,apellidos,nombres,cargo_original,rol,junta_origen_id,correo,telefono_e164,fuente_archivo,fila_origen,es_prueba)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false) RETURNING id`,
        [d.cedula,d.apellidos,d.nombres,d.cargo,d.rol,j.id,d.correo,d.telefono,fuente,d.fila]);
      id=m.id;
    }
    await registrarAuditoria({portal:"admin",actorTipo:"sistema",accion:lote+"_"+cambio,entidad:"mjrv",entidadId:id,datos:{puesto:puesto(d),fila:d.fila}},tx);
    return { d,id,cambio,sustituye:!!anterior,previoSms:prevSms };
  });
}

async function avisos(datos: {d:Entrada; id:number}[], apiKey: string) {
  const brevo = clienteCorreo();
  const config = await leerConfigEnvios();
  const remitente = remitenteEfectivo(config);
  let correoListo = !brevo.simulado && !!remitente.direccion && await brevo.verificarRemitente(remitente.direccion).catch(()=>false);
  if (!correoListo && !brevo.simulado) {
    remitente.direccion = "avisos@consulado.app";
    correoListo = await brevo.verificarRemitente(remitente.direccion).catch(()=>false);
  }
  const medidas = await medidasCredencial();
  for (const {d,id} of datos) {
    const sel = await seleccionarParaCredencial({alcance:"ids",ids:[id]});
    exigir(sel.ids.length===1 && sel.datos[0].cedula===d.cedula && !sel.datos[0].prueba && sel.datos[0].rotulo===rotulo(d), "Credencial no coincide: " + puesto(d));
    const contenido = await prepararContenidoEnvio({canal:"correo",ficha:sel.datos[0],persona:sel.personas[0],rectificacion:false,medidas});
    exigir(Buffer.from(contenido.pdfBase64,"base64").subarray(0,5).toString()==="%PDF-", "No se generó PDF: " + puesto(d));
    exigir(sel.datos[0].nombres === d.nombres,"Nombre no coincide: "+puesto(d));
    await marcarGeneradas([id]);
    let correo = correoListo ? "reservado previamente" : "Brevo no disponible";
    let sms = apiKey ? "pendiente" : "falta API_SMSQUEENS";
    const destinos = await query("SELECT count(*) FILTER (WHERE lower(trim(correo))=$2)::int AS correo,count(*) FILTER (WHERE telefono_e164=$3)::int AS sms FROM mjrv WHERE activo AND NOT es_prueba AND id<>$1",[id,d.correo,d.telefono]);
    if (destinos[0].correo) correo = "contacto compartido";
    if (correoListo && !destinos[0].correo) {
      const envio = await withTx(async tx => {
        await tx.query("SELECT id FROM mjrv WHERE id=$1 FOR UPDATE",[id]);
        const {rows:[fila]} = await tx.query(
          `INSERT INTO envios_credencial(mjrv_id,canal,destino,estado,simulado,intentos,reenvio)
           SELECT m.id,'correo',$2,'en_cola',false,1,true FROM mjrv m WHERE m.id=$1 AND m.activo AND NOT m.es_prueba
            AND lower(trim(m.correo))=$2 AND m.cedula=$4
            AND NOT EXISTS(SELECT 1 FROM auditoria a JOIN envios_credencial e ON a.entidad_id=e.id::text WHERE a.accion=$3 AND e.mjrv_id=m.id)
           ON CONFLICT DO NOTHING RETURNING id`,[id,d.correo,mail,d.cedula]);
        if (fila) await registrarAuditoria({portal:"admin",actorTipo:"sistema",accion:mail,entidad:"envios_credencial",entidadId:fila.id,datos:{puesto:puesto(d)}},tx);
        return fila?.id;
      });
      if (envio) {
        const respuesta = await brevo.enviar({envioId:envio,para:d.correo,asunto:contenido.asunto,texto:contenido.texto,html:contenido.html,remitente,
          responderA:config.correoReplyTo??undefined,adjunto:{nombre:contenido.nombreArchivo,base64:contenido.pdfBase64}});
        correo = respuesta.ok ? "aceptado" : respuesta.incierto ? "incierto" : "rechazado";
        await query("UPDATE envios_credencial SET estado=CASE WHEN brevo_estado IS NOT NULL THEN estado ELSE $2 END,id_externo=coalesce(id_externo,$3),error=$4,enviado_en=now() WHERE id=$1",
          [envio,respuesta.ok?"enviada_al_servicio":"fallo",respuesta.ok?respuesta.idExterno:null,respuesta.ok?null:"Brevo: "+correo]);
      }
    }
    if (destinos[0].sms) sms = "contacto compartido";
    const mensaje = mensajeSmsMadrid(sel.datos[0].nombres);
    if (!mensaje.ok) sms = mensaje.motivo;
    if (apiKey && !destinos[0].sms && mensaje.ok) {
      const token = tokenCredencialSms({id,cedula:d.cedula,telefono:d.telefono},expira);
      const from = remitenteSmsMadrid(d.serie);
      const [reserva] = await query(
        `INSERT INTO envios_sms(mjrv_id,destino,remitente,estado,token_hash)
         SELECT id,$2,$3,'reservado',$4 FROM mjrv WHERE id=$1 AND activo AND NOT es_prueba AND cedula=$5 AND telefono_e164=$2
         ON CONFLICT DO NOTHING RETURNING id`,[id,d.telefono,from,hashEnlaceSms(token),d.cedula]);
      sms = "ya existe un envío al mismo móvil";
      if (reserva) {
        const r = await enviarSmsPubli({id:Number(reserva.id),destino:d.telefono,remitente:from,texto:mensaje.texto,enlace:`https://${host}/s/${token}`,acuse:urlAcuseSms(host,Number(reserva.id))},{apiKey});
        const [guardado] = await query(
          "UPDATE envios_sms SET estado=CASE WHEN estado='reservado' THEN $2 ELSE estado END,codigo_error=CASE WHEN estado='reservado' THEN $3 ELSE codigo_error END,id_externo=coalesce(id_externo,$4),actualizado_en=now() WHERE id=$1 RETURNING estado",
          [reserva.id,r.estado,r.estado==="aceptado"?null:r.codigo,r.estado==="aceptado"?r.idExterno:null]);
        sms = guardado.estado + (r.estado==="aceptado"?"":":"+r.codigo);
      }
    }
    console.log(JSON.stringify({puesto:puesto(d),pdf:true,correo,sms}));
  }
}

async function estado() {
  const resultados = await query(
    `SELECT a.datos->>'puesto' AS puesto, a.accion, m.activo, m.credencial_generada_en IS NOT NULL AS credencial,
        EXISTS(SELECT 1 FROM credenciales_revocadas r WHERE r.mjrv_id=m.id OR r.cedula=m.cedula) AS revocada
       FROM auditoria a JOIN mjrv m ON a.entidad_id=m.id::text
      WHERE a.entidad='mjrv' AND left(a.accion,length($1)+1)=$1||'_' ORDER BY puesto,a.accion`,[lote]);
  const correos = await query(
    `SELECT a.datos->>'puesto' AS puesto, coalesce(e.brevo_estado,e.estado) AS correo
       FROM auditoria a JOIN envios_credencial e ON a.entidad_id=e.id::text
      WHERE a.accion=$1 AND a.entidad='envios_credencial' ORDER BY puesto`,[mail]);
  const sms = await query(
    `SELECT CASE j.serie WHEN 'M' THEN 'F' ELSE 'M' END||j.numero::text||':'||m.rol AS puesto,
        s.estado, s.codigo_error, s.abierto_en IS NOT NULL AS abierto
       FROM mjrv m JOIN juntas_madrid j ON j.id=m.junta_origen_id
       JOIN LATERAL (SELECT estado,codigo_error,abierto_en FROM envios_sms
        WHERE mjrv_id=m.id AND destino=m.telefono_e164 ORDER BY id DESC LIMIT 1) s ON true
      WHERE activo AND NOT es_prueba AND incorporado_en IS NULL
        AND (CASE j.serie WHEN 'M' THEN 'F' ELSE 'M' END||j.numero::text||':'||m.rol)=ANY($1) ORDER BY puesto`,[esperado]);
  const [{activos}] = await query("SELECT count(*)::int AS activos FROM mjrv WHERE activo AND NOT es_prueba AND incorporado_en IS NULL");
  console.log(JSON.stringify({resultados,correos,sms,activos}));
}

async function main() {
  const modo=process.env.CNE_COTEJO_MODO;
  if (modo==="estado") return estado();
  exigir(modo==="comprobar" || modo==="ejecutar","Modo incorrecto");
  const {cambios,cedulas}=JSON.parse(readFileSync(process.env.CNE_COTEJO_ARCHIVO!,"utf8")) as Paquete;
  exigir(cambios.map(puesto).join("|")===esperado.join("|"),"Paquete fuera del alcance aprobado");
  const titulares=new Set(cedulas);
  exigir(titulares.size===284 && cedulas.every(c=>/^\d{10}$/.test(c)),"Padrón de referencia incorrecto");
  for (const d of cambios) {
    exigir(titulares.has(d.cedula) && (!d.anterior || /^\d{10}$/.test(d.anterior)) && /^\+34[67]\d{8}$/.test(d.telefono)
      && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.correo),"Datos inválidos: "+puesto(d));
  }
  const apiKey=readFileSync(process.env.CNE_SMS_ARCHIVO!,"utf8").trim();
  console.log(JSON.stringify({modo,apiSmsDisponible:!!apiKey}));
  const notificar:{d:Entrada;id:number}[]=[];
  for (const d of cambios) {
    try {
      const r=await ajustar(d,titulares,modo==="ejecutar");
      console.log(JSON.stringify({puesto:puesto(d),cambio:r.cambio,revocar:r.sustituye,smsAnterior:r.previoSms ?? null}));
      if(r.id && modo==="ejecutar") notificar.push({d,id:r.id});
    } catch(e) {
      console.log(JSON.stringify({puesto:puesto(d),pendiente:e instanceof Control ? e.message : e && typeof e==="object" && "code" in e ? e.code : "validación"}));
    }
  }
  if(modo==="ejecutar") {
    await avisos(notificar,apiKey);
    await estado();
  }
}
main().catch(e=>{
  console.error(e instanceof Control?e.message:"Operación interrumpida: "+(/^[A-Z0-9]{5}$/.test(e?.code??"")?e.code:"validación"));
  process.exitCode=1;
}).finally(closePools);
