import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { A4, MM } from "../../domain/credencial-layout";

// Cartel A4 con el QR genérico del formulario de documentos (§7.4). No lleva datos personales.
export async function cartelDocumentos(url: string, prueba: boolean): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4.ancho * MM, A4.alto * MM]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const W = page.getWidth();
  const centrado = (t: string, y: number, size: number, f = normal) => page.drawText(t, { x: (W - f.widthOfTextAtSize(t, size)) / 2, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
  centrado("FOTO DE SU CÉDULA", 760, 34, bold);
  centrado("Miembros de Junta Receptora del Voto", 725, 18);
  const qr = await pdf.embedPng(await QRCode.toBuffer(url, { margin: 2, width: 800, errorCorrectionLevel: "M" }));
  const lado = 330;
  page.drawImage(qr, { x: (W - lado) / 2, y: 340, width: lado, height: lado });
  centrado("1. Escanee este código con la cámara del móvil.", 290, 18);
  centrado("2. Escriba su número de cédula.", 262, 18);
  centrado("3. Fotografíe la cara con su foto y la otra cara.", 234, 18);
  centrado("Si necesita ayuda, pregunte al personal.", 190, 16);
  centrado(url, 140, 12);
  if (prueba) centrado("CARTEL DE PRUEBA", 90, 20, bold);
  return pdf.save();
}
