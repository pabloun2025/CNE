import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { decodePDFRawStream, PDFDocument, PDFName, PDFRawStream, PDFString, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { MM } from "../../domain/credencial-layout";

const TINTA = rgb(0x15 / 255, 0x2c / 255, 0x47 / 255);
const MARGEN_QR = 4;
const PLANTILLA = join(process.cwd(), "src/server/pdf/acreditacion-embajada-plantilla.pdf");

function escribir(page: PDFPage, font: PDFFont, texto: string, desdeArriba: number, tamano: number, maximo: number) {
  const linea = texto.trim().replace(/\s+/gu, " ").normalize("NFC").toUpperCase();
  if (!linea) return;
  const ancho = font.widthOfTextAtSize(linea, tamano);
  const size = Math.min(tamano, tamano * maximo * MM / ancho);
  page.drawText(linea, {
    x: (page.getWidth() - font.widthOfTextAtSize(linea, size)) / 2,
    y: page.getHeight() - desdeArriba * MM,
    size, font, color: TINTA,
  });
}

function dibujarQr(pdf: PDFDocument, page: PDFPage, url: string) {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: "M" });
  const x = 30.7 * MM;
  const y = page.getHeight() - 77.95 * MM;
  const lado = 20.4 * MM;
  const paso = lado / (modules.size + 2 * MARGEN_QR);
  const negro = rgb(0, 0, 0);
  for (let fila = 0; fila < modules.size; fila++) {
    for (let columna = 0; columna < modules.size; columna++) {
      if (modules.get(fila, columna)) {
        page.drawRectangle({
          x: x + (MARGEN_QR + columna) * paso,
          y: y + (MARGEN_QR + modules.size - 1 - fila) * paso,
          width: paso, height: paso, color: negro, borderWidth: 0,
        });
      }
    }
  }

  const enlace = pdf.context.obj({
    Type: "Annot", Subtype: "Link", Rect: [x, y, x + lado, y + lado], Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
  });
  page.node.addAnnot(pdf.context.register(enlace));
}

export async function pdfAcreditacionEmbajada(datos: { nombre: string; cargo: string; url: string }): Promise<Uint8Array> {
  const plantilla = await PDFDocument.load(await readFile(PLANTILLA));
  // La plantilla conserva la fuente de la muestra. La copia lleva solo la página y los caracteres usados.
  const fuente = plantilla.catalog.lookup(PDFName.of("FuenteAcreditacion"));
  if (!(fuente instanceof PDFRawStream)) throw new Error("La plantilla de acreditación no contiene su fuente.");
  const pdf = await PDFDocument.create();
  pdf.setTitle("Credencial · Personal de la Embajada · Acceso VIP");
  pdf.setSubject("Jornada electoral del 29 de noviembre de 2026 en Madrid");
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(decodePDFRawStream(fuente).decode(), { subset: true });
  const [page] = await pdf.copyPages(plantilla, [0]);
  pdf.addPage(page);
  escribir(page, font, datos.nombre, 46.05, 11, 47);
  escribir(page, font, datos.cargo, 53.65, 9.3, 48);
  dibujarQr(pdf, page, datos.url);
  return pdf.save();
}
