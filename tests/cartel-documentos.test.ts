import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from "pdf-lib";
import jsQR from "jsqr";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cartelDocumentos } from "@/server/pdf/cartel";

const url = "https://madrid.consulado.app/d";

function textoDelCartel(pdf: PDFDocument): string {
  const contenido = pdf.getPage(0).node.Contents();
  const flujos = contenido instanceof PDFArray ? contenido.asArray() : [contenido];
  const codificacion = new TextDecoder("windows-1252");

  return flujos.flatMap((ref) => {
    const flujo = pdf.context.lookup(ref);
    if (!(flujo instanceof PDFRawStream)) throw new Error("Falta el contenido del cartel");
    const operaciones = Buffer.from(decodePDFRawStream(flujo).decode()).toString("ascii");
    return Array.from(operaciones.matchAll(/<([\da-f]+)>\s*Tj/gi), ([, hex]) =>
      codificacion.decode(Buffer.from(hex, "hex")),
    );
  }).join(" ");
}

describe("cartel para miembros de junta", () => {
  it("imprime una sola página A4 vertical con el formulario y los pasos para cobrar", async () => {
    const pdf = await PDFDocument.load(await cartelDocumentos(url));
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 2);
    expect(height).toBeCloseTo(841.89, 2);

    const texto = textoDelCartel(pdf);
    expect(texto).toContain(url);
    expect(texto).toMatch(/número registrado.*credencial.*iniciales.*junta.*Sí, soy yo/);
    expect(texto).toMatch(/un solo documento.*buena luz.*Cédula.*anverso.*reverso.*Pasaporte.*Escriba su número.*página.*datos/);
    expect(texto).toMatch(/Usar esta foto.*Listo/);
    expect(texto).toMatch(/Pase por Finanzas.*QR de su credencial.*escaneará el QR.*revisará su documento.*imprimirá el recibo.*Firme el recibo en papel.*efectivo en Caja/);
    expect(texto).not.toContain("CARTEL DE PRUEBA");
  });

  it("vincula el importe en euros con su tramo de recibos emitidos", async () => {
    const pdf = await PDFDocument.load(await cartelDocumentos(url));
    const texto = textoDelCartel(pdf);
    expect(texto).toMatch(/58,82 €.*Primeros 190 recibos emitidos.*58,83 €.*Siguientes 95 recibos emitidos/);
    expect(texto).not.toMatch(/USD|tipo de cambio/i);
  });

  it("imprime la misma dirección que abre el código QR", async () => {
    const direccion = "https://documentos.example/d";
    const pdf = await PDFDocument.load(await cartelDocumentos(direccion));
    expect(textoDelCartel(pdf)).toContain(direccion);
    const imagenes = pdf.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
    const imagen = pdf.context.lookup(imagenes?.values()[0]);
    if (!(imagen instanceof PDFRawStream)) throw new Error("Falta la imagen del QR");
    const width = imagen.dict.lookup(PDFName.of("Width"), PDFNumber).asNumber();
    const height = imagen.dict.lookup(PDFName.of("Height"), PDFNumber).asNumber();
    const pixeles = await sharp(decodePDFRawStream(imagen).decode(), { raw: { width, height, channels: 3 } })
      .ensureAlpha().raw().toBuffer();

    expect(jsQR(new Uint8ClampedArray(pixeles), width, height)?.data).toBe(direccion);
  });
});
