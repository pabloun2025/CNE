import { PDFDocument, StandardFonts, grayscale } from "pdf-lib";
import QRCode from "qrcode";
import { A4, MM } from "../../domain/credencial-layout";

// La guía se puede leer en el móvil e imprimir en blanco y negro.
export async function cartelDocumentos(url: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Fotos para su pago | CNE Madrid");
  pdf.setLanguage("es");
  const page = pdf.addPage([A4.ancho * MM, A4.alto * MM]);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negro = grayscale(0.1);
  const gris = grayscale(0.42);
  const fondo = grayscale(0.96);
  const margen = 42;
  const ancho = page.getWidth() - 2 * margen;

  const texto = (contenido: string, x: number, y: number, size: number, font = normal) => {
    page.drawText(contenido, { x, y, size, font, lineHeight: 21, color: negro });
  };
  const centrado = (contenido: string, centro: number, y: number, size: number) => {
    texto(contenido, centro - normal.widthOfTextAtSize(contenido, size) / 2, y, size);
  };
  const linea = (x1: number, x2: number, y: number, color = gris) => {
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 1.1, color });
  };
  const dibujo = (x: number, y: number, tipo: "delante" | "atras" | "pasaporte") => {
    const anchoDocumento = tipo === "pasaporte" ? 104 : 84;
    page.drawRectangle({ x, y, width: anchoDocumento, height: 52, color: grayscale(1), borderColor: negro, borderWidth: 1.5 });
    if (tipo === "pasaporte") {
      page.drawLine({ start: { x: x + 52, y }, end: { x: x + 52, y: y + 52 }, thickness: 1.5, color: negro });
      linea(x + 12, x + 39, y + 32);
      linea(x + 12, x + 39, y + 20);
    }
    const fotoX = x + (tipo === "pasaporte" ? 62 : 9);
    if (tipo !== "atras") {
      page.drawRectangle({ x: fotoX, y: y + 12, width: 26, height: 29, color: fondo, borderColor: gris, borderWidth: 1 });
      page.drawCircle({ x: fotoX + 13, y: y + 30, size: 4, color: gris });
      page.drawEllipse({ x: fotoX + 13, y: y + 19, xScale: 8, yScale: 4, color: gris });
    }
    if (tipo === "atras") {
      linea(x + 12, x + 72, y + 35);
      linea(x + 12, x + 61, y + 25);
      linea(x + 12, x + 72, y + 15);
    } else if (tipo === "delante") {
      linea(x + 44, x + 74, y + 35);
      linea(x + 44, x + 69, y + 26);
      linea(x + 44, x + 74, y + 17);
    }
  };

  texto("CNE 2026 · MADRID", margen, 794, 13, negrita);
  const fecha = "29 de noviembre de 2026";
  texto(fecha, margen + ancho - normal.widthOfTextAtSize(fecha, 13), 794, 13);
  linea(margen, margen + ancho, 778, negro);
  texto("Fotos para su pago", margen, 727, 39, negrita);
  texto("Guarde sus fotos antes de ir al punto de pago.", margen, 692, 20);

  page.drawRectangle({ x: margen, y: 520, width: ancho, height: 145, color: fondo });
  texto("1. Abra el formulario", margen + 16, 633, 22, negrita);
  texto("Escanee el QR con su móvil.\nEscriba su número de cédula.\nPulse «Continuar» y luego «Sí, soy yo».", margen + 16, 607, 17);
  const qr = await pdf.embedPng(await QRCode.toBuffer(url, { margin: 4, scale: 8, errorCorrectionLevel: "M" }));
  const lado = 132;
  const qrX = margen + ancho - lado - 8;
  const tamanoUrl = Math.min(15, (qrX - margen - 22) / negrita.widthOfTextAtSize(url, 1));
  texto(url, margen + 16, 537, tamanoUrl, negrita);
  page.drawImage(qr, { x: qrX, y: 527, width: lado, height: lado });

  texto("2. Tome las fotos", margen, 491, 22, negrita);
  texto("Pulse «Tomar foto» y luego «Usar esta foto» en cada imagen.", margen, 466, 16);
  const anchoTarjeta = (ancho - 16) / 2;
  const pasaporteX = margen + anchoTarjeta + 16;
  for (const x of [margen, pasaporteX]) {
    page.drawRectangle({ x, y: 294, width: anchoTarjeta, height: 154, color: fondo, borderColor: gris, borderWidth: 0.8 });
  }
  texto("Cédula · 2 fotos", margen + 16, 418, 21, negrita);
  dibujo(margen + 20, 345, "delante");
  dibujo(margen + 142, 345, "atras");
  centrado("Delante", margen + 62, 323, 16);
  centrado("Atrás", margen + 184, 323, 16);

  texto("Pasaporte · 1 foto", pasaporteX + 16, 418, 21, negrita);
  const centroPasaporte = pasaporteX + anchoTarjeta / 2;
  dibujo(centroPasaporte - 52, 345, "pasaporte");
  centrado("Página donde sale su foto", centroPasaporte, 323, 16);
  centrado("Si no tiene la cédula física", centroPasaporte, 304, 13);

  texto("3. Espere a ver «Listo»", margen, 251, 22, negrita);
  texto("Al terminar su trabajo en la junta, vaya al punto de pago.\nMuestre el QR de su credencial y su documento.\nFirme el recibo en papel y reciba el efectivo.", margen, 224, 17);

  page.drawRectangle({ x: margen, y: 68, width: ancho, height: 66, color: negro });
  const blanco = grayscale(1);
  const compensacion = "58,82 €";
  page.drawText("Compensación por la jornada", { x: margen + 16, y: 94, size: 19, color: blanco, font: negrita });
  page.drawText(compensacion, { x: margen + ancho - 16 - negrita.widthOfTextAtSize(compensacion, 28), y: 91, size: 28, color: blanco, font: negrita });
  texto("Si necesita ayuda, pregunte al personal.", margen, 38, 14);
  return pdf.save();
}
