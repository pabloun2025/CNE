import { ZONA_HEX, ZONA_NOMBRE, type ZonaColor } from "./juntas";

type DatosMensaje = { nombres: string; rotulo: string; host?: string | null; wallet?: string | null };
type DatosCorreo = Omit<DatosMensaje, "rotulo"> & { junta: string; zona: ZonaColor };

export const TEXTO_WALLET = "Guardar en Google Wallet (Android)";

const FECHA = "29 de noviembre de 2026";
const RECINTO = "Caja Mágica";
const DIRECCION = "Camino de Perales 23, 28041 Madrid";
const MAPA = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${RECINTO}, ${DIRECCION}`)}`;
const LIMITE_INGRESO = "HORA LÍMITE DE INGRESO: 08:00";

function enlaceDocumentos(host?: string | null): string | null {
  const dominio = (host ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return dominio ? `https://${dominio}/d` : null;
}

export function textoCredencial(d: DatosMensaje): string {
  const base = `Buen día, ${d.nombres}. Le enviamos su credencial de miembro de Junta Receptora del Voto (${d.rotulo}). Preséntela con su cédula.`;
  const enlace = enlaceDocumentos(d.host);
  // Con Android puede llevar la credencial en Google Wallet; iPhone sigue con el PDF y el QR.
  const wallet = d.wallet ? ` Si usa Android, también puede guardarla en Google Wallet: ${d.wallet}` : "";
  if (!enlace) return base + wallet;
  return `${base}${wallet} Para su comprobante de pago necesitamos la foto de su cédula (anverso y reverso). Puede subirla aquí: ${enlace}`;
}

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function correoCredencial(d: DatosCorreo): { asunto: string; texto: string; html: string } {
  const firma = "Consulado General del Ecuador en Madrid";
  const asunto = `Su credencial de MJRV – ${FECHA}`;
  const saludo = `Buen día, ${d.nombres}.`;
  const adjunto = `Le enviamos adjunta en PDF su credencial como miembro de una Junta Receptora del Voto (MJRV), para la jornada electoral del domingo ${FECHA}.`;
  const ubicacion = `${RECINTO}, nivel −2`;
  const junta = `Junta ${d.junta}`;
  const zona = `Zona ${ZONA_NOMBRE[d.zona]}`;
  const llegada = "Debe haber ingresado al recinto a más tardar a las 08:00 (hora de Madrid). Llegue con suficiente antelación para registrar su entrada y localizar su zona y su junta.";
  const horario = "La instalación de las juntas comenzará a las 08:30. La votación se desarrollará de 09:00 a 19:00 y, posteriormente, se realizará el escrutinio.";
  const acceso = "Puede presentar la credencial PDF adjunta impresa o desde su teléfono móvil. El código QR permitirá registrar su llegada. Lleve también su cédula de identidad.";
  const documentos = "Para preparar su comprobante de pago, cargue las fotografías del anverso y reverso de su cédula en el siguiente enlace.";
  const enlace = enlaceDocumentos(d.host);
  const wallet = d.wallet ?? null;
  const walletTexto = "Si usa Android, puede guardar su credencial en Google Wallet. En iPhone use el PDF adjunto.";

  const texto = [
    saludo, adjunto, `SU ASIGNACIÓN\n${junta}\n${zona}\n${ubicacion}\n${DIRECCION}\nCómo llegar en Google Maps\n${MAPA}`,
    `${LIMITE_INGRESO}\n${llegada}`, horario, `Acceso al recinto\n${acceso}`,
    ...(wallet ? [`${walletTexto}\n${TEXTO_WALLET}\n${wallet}`] : []),
    ...(enlace ? [`${documentos}\nFormulario de documentación\n${enlace}`] : []), "Atentamente,\n" + firma,
  ].join("\n\n");
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${asunto}</title></head>
<body style="margin:0;background-color:#f3f5f8;color:#202b3c;font:16px/1.5 Arial,sans-serif;overflow-wrap:anywhere">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;text-align:left">
      <tr><td style="padding:20px 24px;background-color:#12325a;color:#ffffff;border-top:4px solid #f0c94f;font-weight:bold">${firma}</td></tr>
      <tr><td style="padding:24px">
        <h1 style="margin:0 0 16px;color:#12325a;font:700 24px/1.25 Arial,sans-serif">${asunto}</h1>
        <p style="margin:0 0 12px">${escapar(saludo)}</p>
        <p style="margin:0 0 16px">${escapar(adjunto)}</p>
        <p style="margin:0 0 16px;padding:12px 14px;background-color:#f3f5f8;border-left:4px solid ${ZONA_HEX[d.zona]}">
          <strong>SU ASIGNACIÓN</strong><br><strong>${escapar(junta)} · ${zona}</strong><br>${ubicacion}<br>${DIRECCION}<br>
          <a style="color:#174c83" href="${escapar(MAPA)}">Cómo llegar en Google Maps</a>
        </p>
        <p style="margin:0 0 16px;padding:12px 14px;background-color:#fff5e6;border-left:4px solid #b96c12"><strong>${LIMITE_INGRESO}</strong><br>${llegada}</p>
        <p style="margin:0 0 16px">${escapar(horario)}</p>
        <p style="margin:0 0 16px;padding:12px 14px;background-color:#eaf1f8;border-left:4px solid #12325a"><strong>Acceso al recinto</strong><br>${acceso}</p>
        ${wallet ? `<p style="margin:0 0 16px">${walletTexto}</p>
        <p style="margin:0 0 16px"><a href="${escapar(wallet)}" style="display:inline-block;padding:12px 20px;background-color:#000000;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:24px">${TEXTO_WALLET}</a></p>` : ""}
        ${enlace ? `<p style="margin:0 0 16px">${documentos}<br><a style="color:#174c83" href="${escapar(enlace)}">Formulario de documentación</a></p>` : ""}
        <p style="margin:0">Atentamente,<br>${firma}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return { asunto, texto, html };
}
