import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { actaPago } from "@/server/pdf/acta";

const datos = {
  numero: "MAD-2026-001",
  ordinalRecibo: 1,
  impresionN: 1,
  prueba: false,
  borrador: false,
  emitidaEn: new Date("2026-11-20T10:00:00Z"),
  persona: { nombres: "NOMBRE PRUEBA 001", apellidos: "APELLIDO PRUEBA 001", cedula: "0000000001", cargo: "VOCAL", juntaVigente: "M54" },
  importe: { usd: "70.00", eur: "58.82", cambio: "1.190" },
  pagador: { nombre: "PAGADOR PRUEBA", cargo: "CARGO PRUEBA" },
};

async function leerRecibo(bytes: Uint8Array) {
  const documento = await PDFDocument.load(bytes);
  const pagina = documento.getPage(0);
  const contenido = pagina.node.Contents();
  const flujo = contenido instanceof PDFArray ? contenido.lookup(0, PDFRawStream) : contenido;
  if (!(flujo instanceof PDFRawStream)) throw new Error("Falta el contenido del recibo");
  const comandos = Buffer.from(decodePDFRawStream(flujo).decode()).toString("ascii");
  const texto = Array.from(comandos.matchAll(/<([\dA-F]+)> Tj/g), ([, hex]) => Buffer.from(hex, "hex").toString("latin1")).join("\n");
  const objetos = pagina.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  const anchosImagenes = objetos?.keys().map((clave) => {
    const objeto = objetos.lookup(clave);
    if (!(objeto instanceof PDFRawStream) || objeto.dict.get(PDFName.of("Subtype")) !== PDFName.of("Image")) return undefined;
    return objeto.dict.lookup(PDFName.of("Width"), PDFNumber).asNumber();
  }) ?? [];
  return { documento, pagina, texto, anchosImagenes };
}

describe("PDF del recibo oficial de pago", () => {
  it("imprime el formulario oficial y las dos caras de la cédula en una hoja A4 horizontal", async () => {
    const anverso = await sharp({ create: { width: 860, height: 540, channels: 3, background: "#add8dc" } }).jpeg().toBuffer();
    const reverso = await sharp({ create: { width: 800, height: 500, channels: 3, background: "#f1cabd" } }).jpeg().toBuffer();
    const { documento, pagina, texto, anchosImagenes } = await leerRecibo(await actaPago({ ...datos, anexo: { anverso, reverso } }));

    expect(documento.getPageCount()).toBe(1);
    expect(pagina.getWidth()).toBeCloseTo((297 * 72) / 25.4);
    expect(pagina.getHeight()).toBeCloseTo((210 * 72) / 25.4);
    expect(texto).toContain("RECIBO DE PAGO - MJRV");
    expect(texto).toContain("ELECCIONES SECCIONALES Y CPCCS 2027");
    expect(texto).toContain("FO-04(PE-PX-SU-02)");
    expect(texto).toContain("MAD-2026-001");
    expect(texto).toContain("NOMBRE PRUEBA 001 APELLIDO PRUEBA 001");
    expect(texto).toContain("0000000001");
    expect(texto).toContain("M54");
    expect(texto).toContain("VOCAL");
    expect(texto).toContain("USD 70,00");
    expect(texto).toContain("1,190");
    expect(texto).toContain("EUR 58,82");
    expect(texto).toContain("FIRMA DEL CIUDADANO");
    expect(texto).toContain("FIRMA Y SELLO DEL CÓNSUL O RESPONSABLE CONSULAR");
    expect(texto).toContain("ANVERSO");
    expect(texto).toContain("REVERSO");
    expect(anchosImagenes).toHaveLength(3); // Logotipo y dos caras de la cédula.
    expect(anchosImagenes).toEqual(expect.arrayContaining([860, 800]));
  });

  it("genera el recibo sin imágenes de identidad cuando no se autoriza el anexo", async () => {
    const { documento, anchosImagenes } = await leerRecibo(await actaPago(datos));

    expect(documento.getPageCount()).toBe(1);
    expect(anchosImagenes).toHaveLength(1); // Solo el logotipo.
  });

  it("deja la firma manuscrita en blanco aunque se facilite una imagen de firma", async () => {
    const firmaReceptor = await sharp({ create: { width: 80, height: 40, channels: 4, background: "#171717" } }).png().toBuffer();
    const { texto, anchosImagenes } = await leerRecibo(await actaPago({ ...datos, firmaReceptor }));

    expect(texto).toContain("FIRMA DEL CIUDADANO");
    expect(anchosImagenes).toHaveLength(1);
  });

  it("conserva los valores y el número en copias históricas sin rellenar el cambio", async () => {
    const historico = {
      ...datos,
      numero: "MAD-001234",
      ordinalRecibo: null,
      reconstruido: true,
      importe: { usd: "127.25", eur: "55.00" },
    };
    const { documento, texto, anchosImagenes } = await leerRecibo(await actaPago(historico));

    expect(documento.getPageCount()).toBe(1);
    expect(texto).toContain("MAD-001234");
    expect(texto).toContain("COPIA RECONSTRUIDA");
    expect(texto).toContain("USD 127.25");
    expect(texto).toContain("EUR 55.00");
    expect(anchosImagenes).toHaveLength(1);
  });
});
