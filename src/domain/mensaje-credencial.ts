type DatosMensaje = { nombres: string; rotulo: string; host?: string | null };

function enlaceDocumentos(host?: string | null): string | null {
  const dominio = (host ?? "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return dominio ? `https://${dominio}/d` : null;
}

export function textoCredencial(d: DatosMensaje): string {
  const base = `Buen día, ${d.nombres}. Le enviamos su credencial de miembro de Junta Receptora del Voto (${d.rotulo}). Preséntela con su cédula.`;
  const enlace = enlaceDocumentos(d.host);
  if (!enlace) return base;
  return `${base} Para su comprobante de pago necesitamos la foto de su cédula (anverso y reverso). Puede subirla aquí: ${enlace}`;
}

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function correoCredencial(d: DatosMensaje): { asunto: string; texto: string; html: string } {
  const firma = "Consulado General del Ecuador en Madrid";
  const asunto = "Su credencial de MJRV";
  const saludo = `Buen día, ${d.nombres}.`;
  const adjunto = `Le enviamos adjunta en PDF su credencial de miembro de una Junta Receptora del Voto (MJRV), identificada con el rótulo ${d.rotulo}.`;
  const acceso = "Si no puede imprimirla, guarde el PDF en su teléfono móvil y muestre el código QR en la puerta para registrar su acceso. Lleve también su cédula de identidad.";
  const documentos = "Para preparar su comprobante de pago, cargue las fotos del anverso y el reverso de su cédula en el formulario de Madrid.";
  const enlace = enlaceDocumentos(d.host);

  const texto = [saludo, adjunto, acceso, ...(enlace ? [`${documentos}\n${enlace}`] : []), "Atentamente,\n" + firma].join("\n\n");
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
        <p style="margin:0 0 16px;padding:12px 14px;background-color:#eaf1f8;border-left:4px solid #12325a"><strong>Acceso al recinto</strong><br>${acceso}</p>
        ${enlace ? `<p style="margin:0 0 16px">${documentos}<br><a style="color:#174c83" href="${escapar(enlace)}">Abrir el formulario de Madrid</a></p>` : ""}
        <p style="margin:0">Atentamente,<br>${firma}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  return { asunto, texto, html };
}
