import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFRef, decodePDFRawStream } from "pdf-lib";

export const FECHA_CONTINGENCIA = "29 de noviembre de 2026";
// Mantiene el ancho de la fecha en el encabezado derecho del PDF anterior.
const FECHA_CONTINGENCIA_CORTA = "29/11/26";

// Las dos plantillas archivadas usan texto WinAnsi y dejan la fecha en la primera página.
// Se corrige ese campo en la copia sin reconstruir el documento ni su firma manuscrita.
export async function normalizarFechaRecibo(bytes: Uint8Array, fechaElectoral = false): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const pagina = pdf.getPages()[0];
  const clave = PDFName.of("Contents");
  const contenido = pagina?.node.Contents();
  const referencias = contenido instanceof PDFArray ? contenido.asArray() : [pagina?.node.get(clave)];
  const flujos = referencias.map((ref) => pdf.context.lookup(ref));
  const comandos = flujos.map((flujo) => flujo instanceof PDFRawStream
    ? Buffer.from(decodePDFRawStream(flujo).decode()).toString("latin1") : "");
  const operadorTexto = /<([\dA-F]+)> Tj/g;
  const textoDe = (hex: string) => Buffer.from(hex, "hex").toString("latin1");
  const contingencia = fechaElectoral || comandos.some((flujo) =>
    Array.from(flujo.matchAll(operadorTexto)).some(([, hex]) => textoDe(hex).includes("EMISIÓN DE CONTINGENCIA")));

  let cambio = false;
  let campoHistorico = false;
  for (const [i, flujo] of comandos.entries()) {
    const corregido = flujo.replace(operadorTexto, (operador, hex: string) => {
      const texto = textoDe(hex);
      const prefijo = /^NRO\. .+?\s+\|\s+EMISIÓN: /.exec(texto)?.[0] ?? (campoHistorico ? "" : undefined);
      campoHistorico = texto === "FECHA DE EMISIÓN";
      if (prefijo === undefined) return operador;
      const fecha = /^(\d{1,2}\/\d{1,2}\/\d{2})(?:, \d{1,2}:\d{2})?$/.exec(texto.slice(prefijo.length));
      if (!fecha) return operador;
      const nuevo = prefijo + (contingencia ? FECHA_CONTINGENCIA_CORTA : fecha[1]);
      return nuevo === texto ? operador : `<${Buffer.from(nuevo, "latin1").toString("hex").toUpperCase()}> Tj`;
    });
    if (corregido === flujo) continue;
    const ref = referencias[i];
    const actualizado = pdf.context.flateStream(Buffer.from(corregido, "latin1"));
    if (ref instanceof PDFRef) pdf.context.assign(ref, actualizado);
    else if (contenido instanceof PDFArray) contenido.set(i, actualizado);
    else pagina.node.set(clave, actualizado);
    cambio = true;
  }
  return cambio ? pdf.save() : bytes;
}
