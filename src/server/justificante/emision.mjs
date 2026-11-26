// Formato de los QR firmados por el puesto Windows de Caja Mágica.
import {createDecipheriv,createPrivateKey,createPublicKey,diffieHellman,hkdfSync,verify} from 'node:crypto';
import {nombreImprimible} from './nombres.mjs';
const CIERRE_MS=Date.parse('2026-11-29T18:00:00Z');
// Hora de Madrid en la que se habilitó la ventanilla de producción.
const INICIO_EMISION_MS=Date.parse('2026-11-25T23:00:00Z');
const x25519Prefix=Buffer.from('302a300506032b656e032100','hex');
const issueContext=Buffer.from('CNE-Madrid-2026-11-29/justificante/v1');
const idFormat=/^[A-Za-z0-9_-]{16}$/;
const stationFormat=/^[A-Za-z0-9_-]{1,32}$/;

function invalid(){
  return Object.assign(new Error('Código de justificante inválido.'),{code:'QR_INVALIDO'});
}
function key(value,type,privateKey){
  const expected=privateKey?'private':'public';
  const key=value?.type===expected ? value : privateKey?createPrivateKey(value):createPublicKey(value);
  if(key.type!==expected || key.asymmetricKeyType!==type)throw invalid();
  return key;
}
function sharedKey(privateKey,publicKey,nonce){
  const shared=diffieHellman({privateKey,publicKey});
  try{return Buffer.from(hkdfSync('sha256',shared,nonce,issueContext,32));}
  finally{shared.fill(0);}
}
function checkData(cedula,nombre,tipo,issued,id){
  if(typeof cedula!=='string'||!/^\d{10}$/.test(cedula)
    ||!nombreImprimible(nombre)||!['con','sin'].includes(tipo)||!Number.isSafeInteger(issued)||issued<INICIO_EMISION_MS||issued>=CIERRE_MS
    ||typeof id!=='string'||!idFormat.test(id))throw invalid();
}

export function canjearEmision(token,{clavesPuestos,clavePrivada,now=Date.now,vigenciaMs=Infinity}){
  try{
    if(typeof token!=='string'||!/^[A-Za-z0-9_-]{165,825}$/.test(token))throw invalid();
    const data=Buffer.from(token,'base64url');
    if(data.toString('base64url')!==token||data[0]!==1)throw invalid();
    const len=data[1];
    if(len<1||len>32)throw invalid();
    const stationEnd=2+len;
    const rawEnd=stationEnd+32;
    const headerEnd=rawEnd+12;
    const signatureStart=data.length-64;
    const tagStart=signatureStart-16;
    if(tagStart<=headerEnd)throw invalid();
    const puesto=data.subarray(2,stationEnd).toString('latin1');
    if(!stationFormat.test(puesto)||!Object.hasOwn(clavesPuestos,puesto))throw invalid();
    if(!verify(null,data.subarray(0,signatureStart),key(clavesPuestos[puesto],'ed25519',false),data.subarray(signatureStart)))
      throw invalid();
    const ephemeral=createPublicKey({key:Buffer.concat([x25519Prefix,data.subarray(stationEnd,rawEnd)]),type:'spki',format:'der'});
    const nonce=data.subarray(rawEnd,headerEnd);
    const aes=sharedKey(key(clavePrivada,'x25519',true),ephemeral,nonce);
    try{
      const decipher=createDecipheriv('aes-256-gcm',aes,nonce);
      decipher.setAAD(data.subarray(0,headerEnd));
      decipher.setAuthTag(data.subarray(tagStart,signatureStart));
      const pending=decipher.update(data.subarray(headerEnd,tagStart));
      try{
        const final=decipher.final();
        try{
          const plain=Buffer.concat([pending,final]);
          try{
            const [cedula,nombre,tipo,emitidoMs,id]=JSON.parse(plain.toString('utf8'));
            checkData(cedula,nombre,tipo,emitidoMs,id);
            const current=now();
            if(!Number.isFinite(current)||emitidoMs>current+120000||current-emitidoMs>vigenciaMs)throw invalid();
            return {cedula,nombre,puesto,tipo,emitidoMs,id};
          }finally{plain.fill(0);}
        }finally{final.fill(0);}
      }finally{pending.fill(0);}
    }finally{aes.fill(0);}
  }catch{throw invalid();}
}
