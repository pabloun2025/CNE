import { PDFDocument, StandardFonts, grayscale } from "pdf-lib";
import QRCode from "qrcode";
import { A4, MM } from "../../domain/credencial-layout";
import { CUPO_RECIBOS, RECIBOS_TRAMO_INICIAL, importeReciboEUR } from "../../domain/recibos";

// El mismo cartel se puede descargar desde Documentos e imprimir en blanco y negro.
export async function cartelDocumentos(url: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Foto de su cédula y cobro en efectivo | CNE Madrid");
  pdf.setLanguage("es");
  const page = pdf.addPage([A4.ancho * MM, A4.alto * MM]);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negro = grayscale(0);
  const borde = grayscale(0.65);
  const margen = 42;
  const ancho = page.getWidth() - 2 * margen;
  const centro = page.getWidth() / 2;
  const texto = (contenido: string, x: number, y: number, size: number, font = normal) => {
    page.drawText(contenido, { x, y, size, font, lineHeight: 18, color: negro });
  };
  const linea = (y: number, color = borde) => {
    page.drawLine({ start: { x: margen, y }, end: { x: margen + ancho, y }, thickness: 0.8, color });
  };
  const tituloPaso = (numero: string, titulo: string, y: number) => {
    page.drawCircle({ x: 62, y: y + 6, size: 11, borderColor: negro, borderWidth: 1 });
    texto(numero, 62 - negrita.widthOfTextAtSize(numero, 13) / 2, y + 1.4, 13, negrita);
    texto(titulo, 82, y, 20, negrita);
  };

  texto("CNE 2026 · MADRID", margen, 793, 12, negrita);
  const fecha = "29 de noviembre de 2026";
  texto(fecha, margen + ancho - normal.widthOfTextAtSize(fecha, 12), 793, 12);
  linea(779, negro);
  texto("Foto de su cédula", margen, 727, 43, negrita);
  texto("y cobro en efectivo", margen, 681, 43, negrita);
  texto("Para miembros de Juntas Receptoras del Voto", margen, 654, 16);

  page.drawRectangle({ x: margen, y: 461, width: ancho, height: 170, borderColor: negro, borderWidth: 1.2 });
  tituloPaso("1", "Abra el formulario", 596);
  texto("Escanee el QR con la cámara del móvil\no escriba este enlace en su navegador.", 62, 553, 15);
  const qr = await pdf.embedPng(await QRCode.toBuffer(url, { margin: 4, scale: 8, errorCorrectionLevel: "M" }));
  const lado = 144;
  const qrX = margen + ancho - lado - 8;
  const tamanoUrl = Math.min(17, (qrX - 70) / negrita.widthOfTextAtSize(url, 1));
  texto(url, 62, 502, tamanoUrl, negrita);
  page.drawImage(qr, { x: qrX, y: 474, width: lado, height: lado });

  tituloPaso("2", "Confirme sus datos", 430);
  texto("Escriba su número de cédula. Compruebe sus iniciales y su junta.\nSi los datos son correctos, pulse «Sí, soy yo».", 82, 405, 15);
  linea(374);

  tituloPaso("3", "Envíe fotos de las dos caras", 349);
  texto("Con buena luz, tome o elija una foto de cada lado.\nEmpiece por el lado con su foto. Pulse «Usar esta foto» en cada una.\nEspere a que aparezca «Listo».", 82, 324, 15);
  linea(275);

  tituloPaso("4", "Pase por Finanzas", 251);
  texto("Al terminar su labor, muestre su cédula y el QR de su credencial.\nEl personal escaneará el QR, revisará su cédula e imprimirá el recibo.", 82, 226, 15);
  linea(195);

  tituloPaso("5", "Firme y cobre en Caja", 172);
  texto("Firme el recibo en papel y reciba el efectivo en Caja.", 82, 147, 15);

  page.drawRectangle({ x: margen, y: 50, width: ancho, height: 79, borderColor: negro, borderWidth: 1.2 });
  texto("Importe según el orden de emisión del recibo", 59, 110, 13, negrita);
  page.drawLine({ start: { x: centro, y: 60 }, end: { x: centro, y: 101 }, thickness: 0.8, color: borde });
  texto(`${importeReciboEUR(1).replace(".", ",")} €`, 59, 80, 26, negrita);
  texto(`Primeros ${RECIBOS_TRAMO_INICIAL} recibos emitidos`, 59, 60, 13);
  texto(`${importeReciboEUR(RECIBOS_TRAMO_INICIAL + 1).replace(".", ",")} €`, centro + 17, 80, 26, negrita);
  texto(`Siguientes ${CUPO_RECIBOS - RECIBOS_TRAMO_INICIAL} recibos emitidos`, centro + 17, 60, 13);

  texto("Si necesita ayuda, pregunte al personal.", margen, 27, 12);
  return pdf.save();
}
