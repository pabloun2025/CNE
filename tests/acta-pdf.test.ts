import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { actaPago, actasContingencia } from "@/server/pdf/acta";
import { normalizarFechaRecibo } from "@/server/pdf/fecha-recibo";

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

async function leerRecibo(bytes: Uint8Array, paginaN = 0) {
  const documento = await PDFDocument.load(bytes);
  const pagina = documento.getPage(paginaN);
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
  it("imprime el FO-04 numerado sin sección de fotos aunque exista un pasaporte", async () => {
    const pasaporte = await sharp({ create: { width: 750, height: 500, channels: 3, background: "#add8dc" } }).jpeg().toBuffer();
    const { documento, pagina, texto, anchosImagenes } = await leerRecibo(await actaPago({
      ...datos, persona: { ...datos.persona, tipoDocumento: "pasaporte" }, anexo: { pasaporte }, sinAnexo: true,
    }));
    expect(documento.getPageCount()).toBe(1);
    expect(pagina.getWidth()).toBeCloseTo((297 * 72) / 25.4);
    expect(texto).toContain("MAD-2026-001");
    expect(texto).toContain("EUR 58,82");
    expect(texto).toContain("FIRMA Y SELLO DEL CÓNSUL");
    expect(texto).not.toMatch(/ANVERSO|REVERSO|PÁGINA DE DATOS/);
    expect(anchosImagenes).toHaveLength(1);
  });

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

  it("imprime la cédula y una sola foto del pasaporte como anexo en el FO-04", async () => {
    const pasaporte = await sharp({ create: { width: 1000, height: 700, channels: 3, background: "#add8dc" } }).jpeg().toBuffer();
    const persona = { ...datos.persona, tipoDocumento: "pasaporte" as const };
    const { documento, pagina, texto, anchosImagenes } = await leerRecibo(await actaPago({ ...datos, persona, anexo: { pasaporte } }));

    expect(documento.getPageCount()).toBe(1);
    expect(pagina.getWidth()).toBeCloseTo((297 * 72) / 25.4);
    expect(pagina.getHeight()).toBeCloseTo((210 * 72) / 25.4);
    expect(texto).toContain("cédula Nro. 0000000001");
    expect(texto).toContain("PÁGINA DE DATOS DEL PASAPORTE");
    expect(texto).not.toMatch(/ANVERSO|REVERSO/);
    expect(anchosImagenes).toHaveLength(2); // Logotipo y página de datos.
    expect(anchosImagenes).toContain(1000);
  });

  it.each([
    { caso: "la emisión original", opciones: {} },
    { caso: "la reimpresión", opciones: { impresionN: 2 } },
    { caso: "la copia reconstruida", opciones: { reconstruido: true } },
    { caso: "la emisión de contingencia", opciones: { contingencia: true } },
  ])("imprime los cinco campos de Madrid en $caso", async ({ opciones }) => {
    const persona = { ...datos.persona, zona: "Azul" };
    const { texto } = await leerRecibo(await actaPago({ ...datos, ...opciones, persona }));

    expect.soft(texto).toContain("CIRCUNSCRIPCIÓN:\nEuropa, Asia y Oceanía\n");
    expect.soft(texto).toContain("PAÍS:\nEspaña\n");
    expect.soft(texto).toContain("OFICINA CONSULAR:\nConsulado General del Ecuador en Madrid\n");
    expect.soft(texto).toContain("ZONA:\nMadrid\n");
    expect.soft(texto).toContain("DIRECCIÓN DOMICILIARIA:\nMadrid\n");
  });

  it.each([
    { ordinalRecibo: 1, etiqueta: "EMISIÓN: " },
    { ordinalRecibo: null, etiqueta: "FECHA DE EMISIÓN\n" },
  ])("conserva la fecha local sin hora y aplica la fecha electoral en contingencia ($ordinalRecibo)", async ({ ordinalRecibo, etiqueta }) => {
    const emitidaEn = new Date("2026-11-20T23:45:00Z");
    const normal = await leerRecibo(await actaPago({ ...datos, ordinalRecibo, emitidaEn, reconstruido: true }));
    expect(normal.texto).toContain(`${etiqueta}21/11/26`);
    expect(normal.texto).not.toMatch(/\b\d{1,2}:\d{2}\b/);
    const contingencia = await leerRecibo(await actaPago({ ...datos, ordinalRecibo, emitidaEn, contingencia: true }));
    expect(contingencia.texto).toContain(`${etiqueta}29 de noviembre de 2026`);
    expect(contingencia.texto).not.toMatch(/\b\d{1,2}:\d{2}\b/);
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

  it("mantiene la cédula en el formato anterior con un pasaporte como anexo", async () => {
    const pasaporte = await sharp({ create: { width: 1000, height: 700, channels: 3, background: "#add8dc" } }).jpeg().toBuffer();
    const persona = { ...datos.persona, tipoDocumento: "pasaporte" as const };
    const pdf = await actaPago({ ...datos, numero: "MAD-001234", ordinalRecibo: null, persona, anexo: { pasaporte } });

    const { documento, texto } = await leerRecibo(pdf);
    expect(documento.getPageCount()).toBe(2);
    expect(texto).toContain("CÉDULA DE IDENTIDAD\n0000000001");
    expect(texto).toContain("MAD-001234");
    const anexo = await leerRecibo(pdf, 1);
    expect(anexo.texto).toContain("PÁGINA DE DATOS DEL PASAPORTE");
    expect(anexo.anchosImagenes).toContain(1000);
  });
});

describe("PDF de contingencia para completar a mano", () => {
  it("incluye por ficha una página A4 apaisada con el número y el EUR en blanco, sin anexo ni hora", async () => {
    const personaPasaporte = { ...datos.persona, tipoDocumento: "pasaporte" as const };
    const segunda = { ...datos.persona, juntaVigente: "M55", cedula: "0000000002" };
    const pdf = await actasContingencia([personaPasaporte, segunda], datos.pagador, true);
    const primera = await leerRecibo(pdf);
    expect(primera.documento.getPageCount()).toBe(2);

    for (const [indice, ficha] of [personaPasaporte, segunda].entries()) {
      const { pagina, texto, anchosImagenes } = await leerRecibo(pdf, indice);
      expect(pagina.getWidth()).toBeCloseTo((297 * 72) / 25.4);
      expect(pagina.getHeight()).toBeCloseTo((210 * 72) / 25.4);
      expect(texto).toContain("CONTINGENCIA · PARA COMPLETAR A MANO");
      expect(texto).toContain("NRO. ____________");
      expect(texto).toContain("FECHA: 29 de noviembre de 2026");
      expect(texto).toContain("Importe entregado: EUR ____________");
      expect(texto).toContain("USD 70,00");
      expect(texto).toContain("1,190");
      expect(texto).toContain(ficha.cedula);
      expect(texto).toContain(ficha.juntaVigente);
      expect(texto).toContain("PAGADOR PRUEBA");
      expect(texto).toContain("PRUEBA");
      expect(texto).not.toMatch(/\b\d{1,2}:\d{2}\b|MAD-2026|58,8[23]|ANVERSO|REVERSO|PÁGINA DE DATOS/);
      expect(anchosImagenes).toHaveLength(1);
    }
  });
});

describe("fecha en recibos PDF archivados", () => {
  it.each([
    { encabezado: "NRO. MAD-2026-001   |   EMISIÓN: ", contingencia: false },
    { encabezado: "FECHA DE EMISIÓN\n", contingencia: false },
    { encabezado: "NRO. MAD-2026-001   |   EMISIÓN: ", contingencia: true },
    { encabezado: "FECHA DE EMISIÓN\n", contingencia: true },
  ])("actualiza solo la fecha visible del archivo ($encabezado, contingencia $contingencia)", async ({ encabezado, contingencia }) => {
    const archivo = await PDFDocument.create();
    const pagina = archivo.addPage();
    (encabezado + "20/11/26, 11:45").split("\n").forEach((texto, i) => pagina.drawText(texto, { y: 700 - i * 24 }));
    pagina.drawText("Texto original. Hora de prueba 11:45. EUR 58,82.", { y: 620 });
    if (contingencia) pagina.drawText("EMISIÓN DE CONTINGENCIA", { y: 580 });
    const firma = await archivo.embedPng(await sharp({ create: { width: 80, height: 40, channels: 4, background: "#171717" } }).png().toBuffer());
    pagina.drawImage(firma, { x: 100, y: 300, width: 80, height: 40 });
    const guardado = await archivo.save();

    const copia = await normalizarFechaRecibo(guardado);
    const { documento, texto, anchosImagenes } = await leerRecibo(copia);
    expect(texto).toContain(encabezado + (contingencia ? "29/11/26" : "20/11/26"));
    expect(texto).not.toContain("20/11/26, 11:45");
    expect(texto).toContain("Texto original. Hora de prueba 11:45. EUR 58,82.");
    expect(anchosImagenes).toEqual([80]);
    const operandoAnterior = Buffer.from("20/11/26, 11:45", "latin1").toString("hex").toUpperCase();
    const flujos = documento.context.enumerateIndirectObjects().map(([, objeto]) => objeto)
      .filter((objeto) => objeto instanceof PDFRawStream);
    expect(flujos.some((flujo) => Buffer.from(decodePDFRawStream(flujo).decode()).toString("latin1").includes(operandoAnterior))).toBe(false);
    expect((await leerRecibo(guardado)).texto).toContain("20/11/26, 11:45");
    expect(await normalizarFechaRecibo(copia)).toBe(copia);
  });
});
