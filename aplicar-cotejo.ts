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

const lote = "padron_madrid_20261127";
const mail = lote + "_correo";
const host = "madrid.consulado.app";
const expira = Date.parse("2026-11-29T23:59:00+01:00");
const fuente = "Padrón oficial Madrid 27-11-2026, revisión 14:51 CET";
type Entrada = {tipo:"baja"|"alta"; serie:"M"|"H"; num:number; rol:string; fila:number; cedula:string; apellidos:string; nombres:string; correo:string; telefono:string; cargo:string};
type Ficha = {id:number; activo:boolean; cedula:string; correo:string; telefono_e164:string; nombres:string};
const rotulo = (d: Entrada) => (d.serie === "M" ? "F" : "M") + d.num;
const puesto = (d: Entrada) => rotulo(d) + ":" + d.rol;
const esperado = ["F14:secretario:alta","M19:presidente:baja","M39:secretario:baja"];
class Control extends Error {}
function exigir(p: unknown, e: string): asserts p { if (!p) throw new Control(e); }
const cedula = (c: string) => c.padStart(10, "0");

async function ajustar(datos: Entrada[], ejecutar: boolean) {
  return withTx(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock($1)",[CLAVE_CANDADO_COLA]);
    const [{modo}] = (await tx.query("SELECT modo FROM configuracion WHERE id=1 FOR UPDATE")).rows;
    exigir(modo === "eleccion", "CNE no está en elección.");
    const informe: {puesto:string; accion:string; smsPrevio?:string}[] = [];
    const notificar: {d:Entrada; id:number}[] = [];
    for (const d of datos) {
      const {rows:[j]} = await tx.query("SELECT id FROM juntas_madrid WHERE serie=$1 AND numero=$2",[d.serie,d.num]);
      exigir(j, "Junta ausente: " + puesto(d));
      const {rows: fichas} = await tx.query<Ficha>(
        "SELECT id,activo,cedula,correo,telefono_e164,nombres FROM mjrv WHERE NOT es_prueba AND incorporado_en IS NULL AND junta_origen_id=$1 AND rol=$2 AND (activo OR cedula IN($3,$4)) FOR UPDATE",
        [j.id,d.rol,d.cedula,d.cedula.replace(/^0/,"")]);
      const active = fichas.filter(f => f.activo);
      const persona = fichas.find(f => cedula(f.cedula) === d.cedula);
      exigir(active.length <= 1 && active.every(f=>cedula(f.cedula) === d.cedula), "Ocupante inesperado: " + puesto(d));
      if (d.tipo === "baja") {
        if (active[0]) {
          const actividad = await tx.query(
            `SELECT 1 FROM v_actuacion_mesa WHERE mjrv_id=$1
             UNION ALL SELECT 1 FROM pagos_confirmados WHERE mjrv_id=$1
             UNION ALL SELECT 1 FROM firmas_recibo WHERE mjrv_id=$1`,[active[0].id]);
          exigir(!actividad.rowCount,"Hay actuación confirmada, firma o pago: "+puesto(d));
        }
        exigir(persona || !active.length, "Baja sin cotejar: " + puesto(d));
        informe.push({puesto:puesto(d),accion:active.length ? "dar de baja" : "ya vacante"});
        if (ejecutar && active[0]) {
          const id = active[0].id;
          await tx.query("UPDATE mjrv SET activo=false,baja_motivo=$2,actualizado_en=now() WHERE id=$1",[id,"Cargo vacante en el padrón oficial de Madrid del 27 de noviembre de 2026."]);
          await tx.query("UPDATE envios_credencial SET estado='fallo',error='Cancelado por baja en el padrón de Madrid.' WHERE mjrv_id=$1 AND NOT simulado AND estado='en_cola' AND intentos=0",[id]);
          await registrarAuditoria({portal:"admin",actorTipo:"sistema",accion:lote+"_baja",entidad:"mjrv",entidadId:id,datos:{puesto:puesto(d)}},tx);
        }
        continue;
      }
      const rev = await tx.query("SELECT 1 FROM credenciales_revocadas WHERE cedula IN ($1,$2) OR mjrv_id=$3",[d.cedula,d.cedula.replace(/^0/,""),persona?.id ?? null]);
      exigir(!rev.rows.length, "Credencial revocada: " + puesto(d));
      if (persona) {
        exigir(persona.correo===d.correo && persona.telefono_e164===d.telefono,"Ficha registrada con contacto distinto: " + puesto(d));
        if (!persona.activo && ejecutar) {
          await tx.query("UPDATE mjrv SET activo=true,baja_motivo=NULL,fuente_archivo=$2,fila_origen=$3,actualizado_en=now() WHERE id=$1",[persona.id,fuente,d.fila]);
          await registrarAuditoria({portal:"admin",actorTipo:"sistema",accion:lote+"_reactivar",entidad:"mjrv",entidadId:persona.id,datos:{puesto:puesto(d)}},tx);
        }
        notificar.push({d,id:persona.id});
        informe.push({puesto:puesto(d),accion:persona.activo?"alta ya registrada":"reactivar"});
        continue;
      }
      const coincidencia = await tx.query("SELECT 1 FROM mjrv WHERE cedula IN($1,$2)",[d.cedula,d.cedula.replace(/^0/,"")]);
      exigir(!coincidencia.rows.length,"Cédula presente en otra ficha: " + puesto(d));
      informe.push({puesto:puesto(d),accion:"alta"});
      if (!ejecutar) continue;
      const {rows:[nueva]} = await tx.query(
        "INSERT INTO mjrv(cedula,apellidos,nombres,cargo_original,rol,junta_origen_id,correo,telefono_e164,fuente_archivo,fila_origen,es_prueba) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false) RETURNING id",
        [d.cedula,d.apellidos,d.nombres,d.cargo,d.rol,j.id,d.correo,d.telefono,fuente,d.fila]);
      await registrarAuditoria({portal:"admin",actorTipo:"sistema",accion:lote+"_alta",entidad:"mjrv",entidadId:nueva.id,datos:{puesto:puesto(d),fila:d.fila}},tx);
      notificar.push({d,id:nueva.id});
    }
    const {rows:[totales]} = await tx.query("SELECT count(*)::int AS activos FROM mjrv WHERE activo AND NOT es_prueba AND incorporado_en IS NULL");
    return {informe,notificar,activos:totales.activos};
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
    exigir(sel.ids.length===1 && sel.datos[0].cedula===d.cedula && sel.datos[0].rotulo===rotulo(d), "Credencial no coincide: " + puesto(d));
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
  const identificados = await query(
    `SELECT CASE j.serie WHEN 'M' THEN 'F' ELSE 'M' END || j.numero::text || ':' || m.rol AS puesto,
            m.activo,m.credencial_generada_en IS NOT NULL AS credencial,
            coalesce(c.brevo_estado,c.estado,'sin correo del lote') AS correo,
            coalesce(s.estado,'sin SMS') AS sms,s.codigo_error AS sms_error,
            s.abierto_en IS NOT NULL AS pdf_abierto
       FROM mjrv m JOIN juntas_madrid j ON j.id=m.junta_origen_id
       LEFT JOIN LATERAL (SELECT e.estado,e.brevo_estado FROM envios_credencial e JOIN auditoria a ON a.entidad_id=e.id::text
         WHERE e.mjrv_id=m.id AND a.accion=$1 ORDER BY e.id DESC LIMIT 1) c ON true
       LEFT JOIN LATERAL (SELECT estado,codigo_error,abierto_en FROM envios_sms WHERE mjrv_id=m.id ORDER BY id DESC LIMIT 1) s ON true
      WHERE m.activo AND NOT m.es_prueba AND (j.serie,j.numero,m.rol) IN
        (('M',14,'secretario'))
      ORDER BY puesto`,[mail]);
  const [totales] = await query(
    `SELECT (SELECT count(*)::int FROM mjrv WHERE activo AND NOT es_prueba AND incorporado_en IS NULL) AS activas,
       (SELECT count(*)::int FROM auditoria a JOIN mjrv m ON a.entidad_id=m.id::text WHERE a.accion=$1 AND NOT m.activo) AS bajas`,[lote+"_baja"]);
  const [cuadro] = await query(
    `SELECT count(*) FILTER (WHERE rol='suplente' AND activo AND NOT es_prueba)::int AS suplentes,
       count(*) FILTER (WHERE rol='suplente' AND NOT activo AND NOT es_prueba)::int AS suplentes_inactivos
     FROM mjrv`);
  const vacantes = await query(
    `SELECT c.rol,count(*)::int AS total
       FROM juntas_madrid j CROSS JOIN (VALUES ('presidente'),('secretario'),('vocal')) c(rol)
      WHERE NOT EXISTS (SELECT 1 FROM mjrv m WHERE m.junta_origen_id=j.id
        AND m.rol=c.rol AND m.activo AND NOT m.es_prueba AND m.incorporado_en IS NULL)
      GROUP BY c.rol ORDER BY c.rol`);
  const objetivos = await query(
    `SELECT CASE x.serie WHEN 'M' THEN 'F' ELSE 'M' END||x.numero::text AS junta,x.rol,count(m.id)::int AS activos
       FROM (VALUES ('M',14,'secretario'),('H',19,'presidente'),('H',39,'secretario')) x(serie,numero,rol)
       JOIN juntas_madrid j ON j.serie=x.serie AND j.numero=x.numero
       LEFT JOIN mjrv m ON m.junta_origen_id=j.id AND m.rol=x.rol AND m.activo AND NOT m.es_prueba AND m.incorporado_en IS NULL
      GROUP BY x.serie,x.numero,x.rol ORDER BY junta`);
  console.log(JSON.stringify({verificacion:identificados,...totales,...cuadro,vacantes,objetivos}));
}

async function main() {
  const modo = process.env.CNE_COTEJO_MODO;
  if (modo === "estado") return estado();
  exigir(modo==="comprobar" || modo==="ejecutar","Modo incorrecto.");
  const datos = JSON.parse(readFileSync(process.env.CNE_COTEJO_ARCHIVO!,"utf8")) as Entrada[];
  exigir(datos.map(d=>puesto(d)+":"+d.tipo).join("|")===esperado.join("|"),"Paquete fuera del alcance aprobado.");
  for (const d of datos) {
    exigir(/^\d{10}$/.test(d.cedula),"Cédula inválida: " + puesto(d));
    if(d.tipo!=="baja") exigir(/^\+[1-9]\d{7,14}$/.test(d.telefono) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.correo),"Contacto inválido: " + puesto(d));
  }
  const apiKey = readFileSync(process.env.CNE_SMS_ARCHIVO!,"utf8").trim();
  const r = await ajustar(datos,modo==="ejecutar");
  console.log(JSON.stringify({activos:r.activos, cambios:r.informe, apiSmsDisponible:!!apiKey, aplicado:modo==="ejecutar"}));
  if(modo==="ejecutar") {
    await avisos(r.notificar,apiKey);
    await estado();
  }
}
main().catch(e=>{
  console.error(e instanceof Control ? e.message : "Operación interrumpida: "+(/^[A-Z0-9]{5}$/.test(e?.code??"")?e.code:"validación"));
  process.exitCode=1;
}).finally(closePools);
