import { ZONA_HEX, ZONA_NOMBRE, type ZonaColor } from "./juntas";

type DatosMensaje = { nombres: string; rotulo: string; host?: string | null; wallet?: string | null };
type DatosCorreo = Omit<DatosMensaje, "rotulo"> & { junta: string; zona: ZonaColor };

export const TEXTO_WALLET = "Guardar en Google Wallet (Android)";

const FECHA = "29 de noviembre de 2026";
const RECINTO = "Caja Mágica";
const DIRECCION = "Camino de Perales 23, 28041 Madrid";
const MAPA = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${RECINTO}, ${DIRECCION}`)}`;
const DOCUMENTOS_PAGO = "Para su comprobante de pago, busque su ficha con su número de cédula y suba imágenes de su cédula o pasaporte. Si usa la cédula, fotografíe el anverso y el reverso. Si no tiene la cédula física, suba una sola foto de la página de datos del pasaporte.";

function enlaceDocumentos(host?: string | null): string | null {
  const dominio = (host ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return dominio ? `https://${dominio}/d` : null;
}

export function textoCredencial(d: DatosMensaje): string {
  const base = `Buen día, ${d.nombres}. Le enviamos su credencial de miembro de Junta Receptora del Voto (${d.rotulo}). Presente el QR y lleve su documento de identidad.`;
  const enlace = enlaceDocumentos(d.host);
  // Con Android puede llevar la credencial en Google Wallet; iPhone sigue con el PDF y el QR.
  const wallet = d.wallet ? ` Si usa Android, también puede guardarla en Google Wallet: ${d.wallet}` : "";
  if (!enlace) return base + wallet;
  return `${base}${wallet} ${DOCUMENTOS_PAGO} Formulario de documentación en ${enlace}`;
}

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function correoCredencial(d: DatosCorreo): { asunto: string; texto: string; html: string } {
  const firma = "Consulado General del Ecuador en Madrid";
  const titulo = "Su credencial electoral";
  const asunto = `${titulo} – ${FECHA}`;
  const saludo = `Buen día, ${d.nombres}.`;
  const ubicacion = `${RECINTO}, nivel −2`;
  const junta = `Junta ${d.junta} · Zona ${ZONA_NOMBRE[d.zona]}`;
  const llegada = "Entre al recinto a más tardar a las 08:00 (hora de Madrid).";
  const horario = "Instalación de las juntas a las 08:30. Votación de 09:00 a 19:00. Después, recuento de votos.";
  const acceso = "Su credencial está en el PDF adjunto. Muestre el código QR en papel o en su móvil. Lleve también su cédula o pasaporte.";
  const enlace = enlaceDocumentos(d.host);
  const fotos = "Suba las fotos antes de ir al punto de pago";
  const abrir = "Subir fotos de mi documento";
  const buscar = "Escriba su número de cédula, incluso si va a usar su pasaporte. Pulse «Continuar» y luego «Sí, soy yo».";
  const cedula = "Cédula · Tome dos fotos, una de delante y otra de atrás.";
  const pasaporte = "Pasaporte · Si no tiene la cédula física, tome una foto de la página donde sale su foto.";
  const guardar = "Pulse «Tomar foto» y luego «Usar esta foto» en cada imagen.";
  const listo = "Espere a que aparezca «Listo». Al terminar su trabajo en la junta, vaya al punto de pago.";
  const guia = "Ver guía con dibujos (PDF)";
  const wallet = d.wallet ?? null;

  const texto = [
    saludo, `Domingo ${FECHA}\n${junta}\n${ubicacion}\n${DIRECCION}\n${llegada}\nCómo llegar en Google Maps: ${MAPA}`,
    acceso,
    ...(wallet ? [`${TEXTO_WALLET}: ${wallet}`] : []),
    ...(enlace ? [`${fotos}\n${abrir}: ${enlace}\n1. ${buscar}\n2. ${cedula}\n   ${pasaporte}\n   ${guardar}\n3. ${listo}\n${guia}: ${enlace}/guia`] : []),
    horario, firma,
  ].join("\n\n");
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${asunto}</title></head>
<body style="margin:0;background-color:#f3f5f8;color:#202b3c;font:16px/1.5 Arial,sans-serif;overflow-wrap:anywhere">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:12px 8px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;text-align:left">
      <tr><td style="padding:12px 16px;background-color:#12325a;color:#ffffff;border-top:4px solid #f0c94f;font-weight:bold">${firma}</td></tr>
      <tr><td style="padding:16px">
        <h1 style="margin:0 0 12px;color:#12325a;font:700 25px/1.25 Arial,sans-serif">${titulo}</h1>
        <p style="margin:0 0 12px">${escapar(saludo)}</p>
        <p style="margin:0 0 12px;padding:12px;background-color:#f3f5f8;border-left:4px solid ${ZONA_HEX[d.zona]}">
          <strong>${escapar(junta)}</strong><br>Domingo ${FECHA}<br>${ubicacion}<br>${DIRECCION}<br>
          <strong>${llegada}</strong><br><a style="color:#174c83" href="${escapar(MAPA)}">Cómo llegar en Google Maps</a>
        </p>
        <p style="margin:0 0 12px">${acceso}</p>
        ${wallet ? `<p style="margin:0 0 12px"><a href="${escapar(wallet)}" style="color:#174c83">${TEXTO_WALLET}</a></p>` : ""}
        ${enlace ? `<h2 style="margin:20px 0 8px;color:#12325a;font:700 20px/1.3 Arial,sans-serif">${fotos}</h2>
        <p style="margin:0 0 12px"><a style="display:inline-block;padding:12px 16px;background-color:#12325a;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:6px" href="${escapar(enlace)}">${abrir}</a></p>
        <ol style="margin:0 0 8px;padding-left:24px">
          <li style="margin:0 0 8px">${buscar}</li>
          <li style="margin:0 0 8px"><strong>${cedula}</strong><br>${pasaporte}<br>${guardar}</li>
          <li style="margin:0 0 8px"><strong>${listo}</strong></li>
        </ol>
        <p style="margin:0 0 16px"><a style="color:#174c83" href="${escapar(enlace)}/guia">${guia}</a></p>` : ""}
        <p style="margin:0;color:#394d65;font-size:14px">${horario}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return { asunto, texto, html };
}
