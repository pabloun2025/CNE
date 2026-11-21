import { PDFDocument, StandardFonts, grayscale } from "pdf-lib";
import QRCode from "qrcode";
import { A4, MM } from "../../domain/credencial-layout";
import { CUPO_RECIBOS, RECIBOS_TRAMO_INICIAL, importeReciboEUR } from "../../domain/recibos";

// El mismo cartel se puede descargar desde Documentos e imprimir en blanco y negro.
export async function cartelDocumentos(url: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Foto de su documento y cobro en efectivo | CNE Madrid");
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
  texto("Foto de su documento", margen, 727, 43, negrita);
  texto("y cobro en efectivo", margen, 681, 43, negrita);
  texto("Para miembros de Juntas Receptoras del Voto", margen, 654, 16);

  page.drawRectangle({ x: margen, y: 473, width: ancho, height: 158, borderColor: negro, borderWidth: 1.2 });
  tituloPaso("1", "Abra el formulario", 601);
  texto("Escanee el QR con la cámara del móvil\no escriba este enlace en su navegador.", 62, 560, 15);
  const qr = await pdf.embedPng(await QRCode.toBuffer(url, { margin: 4, scale: 8, errorCorrectionLevel: "M" }));
  const lado = 138;
  const qrX = margen + ancho - lado - 8;
  const tamanoUrl = Math.min(17, (qrX - 70) / negrita.widthOfTextAtSize(url, 1));
  texto(url, 62, 511, tamanoUrl, negrita);
  page.drawImage(qr, { x: qrX, y: 483, width: lado, height: lado });

  tituloPaso("2", "Confirme sus datos", 444);
  texto("Escriba el número registrado en su ficha o credencial de MJRV.\nCompruebe sus iniciales y su junta. Pulse «Sí, soy yo».", 82, 419, 15);
  linea(388);

  tituloPaso("3", "Envíe las fotos de su documento", 363);
  texto("Elija un solo documento. Tome las fotos con buena luz.", 82, 338, 15);
  texto("Cédula", 82, 320, 15, negrita);
  texto("Envíe una foto del anverso y otra del reverso.", 169, 320, 15);
  texto("Pasaporte", 82, 302, 15, negrita);
  texto("Escriba su número tal como figura en el documento\ny envíe una foto de la página con sus datos y su foto.", 169, 302, 15);
  texto("Pulse «Usar esta foto» en cada imagen. Espere a que aparezca «Listo».", 82, 266, 14);
  linea(253);

  tituloPaso("4", "Pase por Finanzas", 231);
  texto("Al terminar, muestre el documento que usó y el QR de su credencial.\nEl personal escaneará el QR, revisará su documento e imprimirá el recibo.", 82, 207, 14);
  linea(177);

  tituloPaso("5", "Firme y cobre en Caja", 155);
  texto("Firme el recibo en papel y reciba el efectivo en Caja.", 82, 132, 15);

  page.drawRectangle({ x: margen, y: 50, width: ancho, height: 69, borderColor: negro, borderWidth: 1.2 });
  texto("Importe según el orden de emisión del recibo", 59, 102, 13, negrita);
  page.drawLine({ start: { x: centro, y: 60 }, end: { x: centro, y: 96 }, thickness: 0.8, color: borde });
  texto(`${importeReciboEUR(1).replace(".", ",")} €`, 59, 77, 23, negrita);
  texto(`Primeros ${RECIBOS_TRAMO_INICIAL} recibos emitidos`, 59, 60, 13);
  texto(`${importeReciboEUR(RECIBOS_TRAMO_INICIAL + 1).replace(".", ",")} €`, centro + 17, 77, 23, negrita);
  texto(`Siguientes ${CUPO_RECIBOS - RECIBOS_TRAMO_INICIAL} recibos emitidos`, centro + 17, 60, 13);

  texto("Si necesita ayuda, pregunte al personal.", margen, 27, 12);
  return pdf.save();
}
