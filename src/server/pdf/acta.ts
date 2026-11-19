import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { eurosEnLetras } from "../../domain/pago";
import { A4, MM } from "../../domain/credencial-layout";

export type DatosActa = {
  numero: string; // MAD-000123 · PRUEBA-000123
  impresionN: number; // 1 = original; >1 = REIMPRESIÓN n
  prueba: boolean;
  borrador: boolean; // sin parámetros completos: sin cifras
  emitidaEn: Date;
  persona: { apellidos: string; nombres: string; cedula: string; cargo: string; juntaVigente: string };
  importe: { usd: string; eur: string } | null;
  pagador: { nombre: string; cargo: string } | null;
  anverso: Buffer;
  reverso: Buffer;
};

// El concepto es el del título del modelo entregado. No se añade otra declaración.
const CONCEPTO = "compensación económica";

const tinta = rgb(0x25 / 255, 0x38 / 255, 0x4b / 255);
const azul = rgb(0x21 / 255, 0x65 / 255, 0xa2 / 255);
const marino = rgb(0x19 / 255, 0x39 / 255, 0x5f / 255);
const suave = rgb(0x64 / 255, 0x77 / 255, 0x8d / 255);
const linea = rgb(0xd7 / 255, 0xe0 / 255, 0xe8 / 255);
const fondo = rgb(0xf5 / 255, 0xf8 / 255, 0xfb / 255);
const fondoEur = rgb(0xed / 255, 0xf4 / 255, 0xfb / 255);
const amarillo = rgb(0xe1 / 255, 0xb3 / 255, 0x25 / 255);
const papel = rgb(0xf7 / 255, 0xf9 / 255, 0xfb / 255);

const latin = (t: string) => t.replace(/[^\u0020-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u20ac\u2026]/g, "?");
const fechaMadrid = (d: Date) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" }).format(d);
const logoBytes = readFileSync(join(process.cwd(), "src/server/pdf/logo-cne.jpg"));

function partir(texto: string, f: PDFFont, size: number, ancho: number): string[] {
  const out: string[] = [];
  let actual = "";
  for (const palabra of latin(texto).split(/\s+/).filter(Boolean)) {
    const sig = actual ? `${actual} ${palabra}` : palabra;
    if (actual && f.widthOfTextAtSize(sig, size) > ancho) { out.push(actual); actual = palabra; } else actual = sig;
  }
  if (actual) out.push(actual);
  return out.length ? out : [""];
}

function marcaDeAgua(page: PDFPage, f: PDFFont, prueba: boolean) {
  if (!prueba) return;
  const t = "PRUEBA — SIN VALIDEZ";
  const size = 54;
  const w = f.widthOfTextAtSize(latin(t), size);
  page.drawText(latin(t), { x: page.getWidth() / 2 - (w / 2) * Math.SQRT1_2, y: page.getHeight() / 2 - (w / 2) * Math.SQRT1_2, size, font: f, color: rgb(0.85, 0, 0), opacity: 0.18, rotate: degrees(45) });
}

// Recibo de dos páginas según el modelo entregado (Modelo_recibo_pago_MJRV_2026). Imprimir no registra el pago.
export async function actaPago(d: DatosActa): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedJpg(logoBytes);
  const W = A4.ancho * MM, H = A4.alto * MM, ML = 19 * MM, MR = 19 * MM;
  const ancho = W - ML - MR;
  const numero = d.impresionN > 1 ? `${d.numero} · REIMPRESIÓN ${d.impresionN}` : d.numero;

  const encabezado = (page: PDFPage, derecha: string[]) => {
    const altoLogo = (75 * MM) * (logo.height / logo.width);
    page.drawImage(logo, { x: ML, y: H - 18 * MM - altoLogo, width: 75 * MM, height: altoLogo });
    let y = H - 18 * MM - 4;
    for (const [i, linea] of derecha.entries()) {
      const f = i === 0 || i === 1 ? bold : normal;
      const size = i === 0 || i === 1 ? 10.6 : 9.4;
      const w = f.widthOfTextAtSize(latin(linea), size);
      page.drawText(latin(linea), { x: W - MR - w, y, size, font: f, color: marino });
      y -= size + 3;
    }
    const base = H - 18 * MM - Math.max(altoLogo, 18 * MM) - 8;
    page.drawLine({ start: { x: ML, y: base }, end: { x: W - MR, y: base }, thickness: 2.2, color: azul });
    return base;
  };

  const pie = (page: PDFPage, nota: string, pagina: string) => {
    const y = 12 * MM;
    page.drawLine({ start: { x: ML, y: y + 14 }, end: { x: W - MR, y: y + 14 }, thickness: 0.6, color: linea });
    const lineas = partir(nota, normal, 7.5, 135 * MM);
    lineas.forEach((l, i) => page.drawText(latin(l), { x: ML, y: y + 2 - i * 9, size: 7.5, font: normal, color: suave }));
    const w = normal.widthOfTextAtSize(pagina, 7.5);
    page.drawText(pagina, { x: W - MR - w, y: y + 2, size: 7.5, font: normal, color: suave });
  };

  const p1 = pdf.addPage([W, H]);
  let y = encabezado(p1, ["CONSULADO GENERAL DEL", "ECUADOR EN MADRID", "Madrid · España", "Jornada electoral: 29 de noviembre de 2026"]);
  y -= 13 * MM;
  const estado = d.borrador ? "BORRADOR · IMPORTE PENDIENTE DE APROBACIÓN" : "MODELO DE TRABAJO · PENDIENTE DE VALIDACIÓN INSTITUCIONAL";
  p1.drawText(latin(estado), { x: ML, y, size: 8, font: bold, color: suave });
  y -= 16;
  for (const linea of ["RECIBO DE ENTREGA Y RECEPCIÓN", "DE COMPENSACIÓN ECONÓMICA"]) {
    p1.drawText(latin(linea), { x: ML, y, size: 16, font: bold, color: marino });
    y -= 20;
  }
  p1.drawText("Miembro de Junta Receptora del Voto (MJRV) · Documento 1 de 2", { x: ML, y, size: 9.5, font: normal, color: suave });
  y -= 10 * MM;

  const seccion = (titulo: string) => {
    p1.drawText(latin(titulo), { x: ML, y, size: 10, font: bold, color: azul });
    y -= 6 * MM;
  };
  const caja = (x: number, yy: number, w: number, h: number, derecha: boolean, abajo: boolean) => {
    if (derecha) p1.drawLine({ start: { x: x + w, y: yy }, end: { x: x + w, y: yy + h }, thickness: 0.6, color: linea });
    if (abajo) p1.drawLine({ start: { x, y: yy }, end: { x: x + w, y: yy }, thickness: 0.6, color: linea });
  };
  const campo = (x: number, yy: number, w: number, h: number, clave: string, valor: string) => {
    p1.drawText(latin(clave), { x: x + 8, y: yy + h - 12, size: 7.5, font: bold, color: suave });
    const lineas = partir(valor, bold, 10, w - 16);
    lineas.slice(0, 2).forEach((l, i) => p1.drawText(latin(l), { x: x + 8, y: yy + h - 26 - i * 12, size: 10, font: bold, color: tinta }));
  };

  seccion("IDENTIFICACIÓN DEL COMPROBANTE");
  const hCampo = 14.8 * MM;
  const mitad = ancho / 2;
  p1.drawRectangle({ x: ML, y: y - hCampo, width: ancho, height: hCampo, borderColor: linea, borderWidth: 0.8 });
  campo(ML, y - hCampo, mitad, hCampo, "NÚMERO DEL COMPROBANTE", numero);
  campo(ML + mitad, y - hCampo, mitad, hCampo, "FECHA DE EMISIÓN", fechaMadrid(d.emitidaEn));
  caja(ML, y - hCampo, mitad, hCampo, true, false);
  y -= hCampo + 5 * MM;

  seccion("DATOS DEL MIEMBRO DE JUNTA");
  const filas: [string, string, boolean][] = [
    ["APELLIDOS", d.persona.apellidos, true],
    ["NOMBRES", d.persona.nombres, true],
    ["CÉDULA DE IDENTIDAD", d.persona.cedula, true],
    ["JUNTA RECEPTORA DEL VOTO", d.persona.juntaVigente, true],
    ["FUNCIÓN EN LA JUNTA", d.persona.cargo, false],
  ];
  const altoGrid = hCampo * 3;
  p1.drawRectangle({ x: ML, y: y - altoGrid, width: ancho, height: altoGrid, borderColor: linea, borderWidth: 0.8 });
  filas.forEach((item, i) => {
    const anchoCampo = item[2] ? mitad : ancho;
    const col = item[2] && i % 2 === 1 ? 1 : 0;
    const fila = item[2] ? Math.floor(i / 2) : 2;
    const x = ML + col * mitad;
    const yy = y - (fila + 1) * hCampo;
    campo(x, yy, anchoCampo, hCampo, item[0], item[1]);
    if (item[2] && col === 0) caja(x, yy, mitad, hCampo, true, fila < 2);
    if (!item[2] || fila < 2) caja(x, yy, anchoCampo, hCampo, false, fila < 1 || (item[2] && fila === 0));
  });
  // Líneas horizontales entre las tres filas.
  p1.drawLine({ start: { x: ML, y: y - hCampo }, end: { x: ML + ancho, y: y - hCampo }, thickness: 0.6, color: linea });
  p1.drawLine({ start: { x: ML, y: y - 2 * hCampo }, end: { x: ML + ancho, y: y - 2 * hCampo }, thickness: 0.6, color: linea });
  y -= altoGrid + 5 * MM;

  seccion("DETALLE ECONÓMICO");
  const hKpi = 18 * MM;
  const tercio = ancho / 3;
  const celdas: [string, string, boolean][] = d.borrador || !d.importe
    ? [["IMPORTE DE REFERENCIA", "pendiente", false], ["TIPO DE CAMBIO APLICADO", "—", false], ["IMPORTE ENTREGADO", "pendiente", true]]
    : [["IMPORTE DE REFERENCIA", `USD ${d.importe.usd}`, false], ["TIPO DE CAMBIO APLICADO", "—", false], ["IMPORTE ENTREGADO", `EUR ${d.importe.eur}`, true]];
  celdas.forEach((c, i) => {
    const x = ML + i * tercio;
    p1.drawRectangle({ x, y: y - hKpi, width: tercio, height: hKpi, color: c[2] ? fondoEur : fondo, borderColor: linea, borderWidth: 0.6 });
    const cap = c[0];
    const cw = normal.widthOfTextAtSize(latin(cap), 7.5);
    p1.drawText(latin(cap), { x: x + (tercio - cw) / 2, y: y - 14, size: 7.5, font: normal, color: suave });
    const nw = bold.widthOfTextAtSize(latin(c[1]), c[2] ? 13 : 12);
    p1.drawText(latin(c[1]), { x: x + (tercio - nw) / 2, y: y - hKpi + 10, size: c[2] ? 13 : 12, font: bold, color: c[2] ? azul : marino });
  });
  y -= hKpi + 5 * MM;

  const declaracion = d.borrador || !d.importe
    ? "Borrador. El valor en euros aún no está escrito. Este documento no acredita la entrega de efectivo."
    : `Por medio del presente documento, quien suscribe como receptor/a deja constancia de haber recibido en efectivo la cantidad de ${eurosEnLetras(d.importe.eur)} (EUR ${d.importe.eur}), por concepto de ${CONCEPTO}, correspondiente a la jornada electoral del 29 de noviembre de 2026.`;
  const declLineas = partir(declaracion, normal, 9.5, ancho - 16);
  const hDecl = 8 * MM + declLineas.length * 13;
  p1.drawRectangle({ x: ML, y: y - hDecl, width: ancho, height: hDecl, color: papel });
  p1.drawRectangle({ x: ML, y: y - hDecl, width: 3, height: hDecl, color: amarillo });
  declLineas.forEach((l, i) => p1.drawText(latin(l), { x: ML + 10, y: y - 16 - i * 13, size: 9.5, font: normal, color: tinta }));
  y -= hDecl;
  // La línea queda baja para dejar sitio a la firma manuscrita, sin pisar el pie.
  const lineaFirma = 46 * MM;
  if (y > lineaFirma) y = lineaFirma;

  const pag = d.pagador ?? { nombre: "(pendiente)", cargo: "" };
  const firmas: [string, string, string][] = [
    [pag.nombre, pag.cargo, "Firma de quien entrega el pago"],
    [`${d.persona.nombres} ${d.persona.apellidos}`, `C. I. ${d.persona.cedula}`, "Firma de quien recibe el pago"],
  ];
  const anchoFirma = (ancho - 12 * MM) / 2;
  const centrado = (texto: string, x: number, yy: number, f: PDFFont, size: number) => {
    const l = partir(texto, f, size, anchoFirma)[0] ?? "";
    const w = f.widthOfTextAtSize(latin(l), size);
    p1.drawText(latin(l), { x: x + (anchoFirma - w) / 2, y: yy, size, font: f, color: tinta });
  };
  firmas.forEach((f, i) => {
    const x = ML + i * (anchoFirma + 12 * MM);
    p1.drawLine({ start: { x, y }, end: { x: x + anchoFirma, y }, thickness: 0.8, color: suave });
    centrado(f[0], x, y - 16, bold, 9);
    if (f[1]) centrado(f[1], x, y - 28, normal, 9);
    centrado(f[2], x, y - (f[1] ? 40 : 28), normal, 9);
  });

  pie(p1, "El recibo se firma tras la entrega física del efectivo. Su impresión no equivale a pago confirmado en el sistema. El registro electrónico del desembolso se realiza después de la entrega.", "Pág. 1 / 2");
  marcaDeAgua(p1, bold, d.prueba);

  const p2 = pdf.addPage([W, H]);
  let y2 = encabezado(p2, ["CONSULADO GENERAL DEL", "ECUADOR EN MADRID", "Anexo de identidad · Jornada 2026"]);
  y2 -= 13 * MM;
  p2.drawText("MODELO DE TRABAJO · ANEXO AL RECIBO", { x: ML, y: y2, size: 8, font: bold, color: suave });
  y2 -= 18;
  p2.drawText("ANEXO — DOCUMENTO DE IDENTIDAD", { x: ML, y: y2, size: 16, font: bold, color: marino });
  y2 -= 16;
  const intro = partir(`Anverso y reverso de la cédula vinculada a la ficha del MJRV y al comprobante ${d.numero}.`, normal, 9.5, ancho);
  intro.forEach((l) => { p2.drawText(latin(l), { x: ML, y: y2, size: 9.5, font: normal, color: suave }); y2 -= 12; });
  y2 -= 6 * MM;

  const altoImg = 58 * MM;
  for (const [rotulo, buf] of [["ANVERSO · CÉDULA DE IDENTIDAD", d.anverso], ["REVERSO · CÉDULA DE IDENTIDAD", d.reverso]] as const) {
    const altoPanel = 8 * MM + altoImg;
    p2.drawRectangle({ x: ML, y: y2 - altoPanel, width: ancho, height: altoPanel, borderColor: linea, borderWidth: 0.8 });
    p2.drawRectangle({ x: ML, y: y2 - 8 * MM, width: ancho, height: 8 * MM, color: fondo });
    p2.drawText(rotulo, { x: ML + 8, y: y2 - 5.2 * MM, size: 9, font: bold, color: azul });
    const img: PDFImage = await pdf.embedJpg(buf);
    const esc = Math.min((ancho - 8 * MM) / img.width, (altoImg - 4 * MM) / img.height);
    const iw = img.width * esc, ih = img.height * esc;
    p2.drawImage(img, { x: ML + (ancho - iw) / 2, y: y2 - altoPanel + (altoImg - ih) / 2, width: iw, height: ih });
    y2 -= altoPanel + 4 * MM;
  }

  const ref = `MJRV: ${d.persona.nombres} ${d.persona.apellidos}  |  C. I.: ${d.persona.cedula}  |  JRV: ${d.persona.juntaVigente}`;
  const refLineas = partir(ref, normal, 9, ancho - 16);
  const hRef = 6 * MM + refLineas.length * 12;
  p2.drawRectangle({ x: ML, y: y2 - hRef, width: 3, height: hRef, color: amarillo });
  p2.drawRectangle({ x: ML + 3, y: y2 - hRef, width: ancho - 3, height: hRef, color: papel });
  refLineas.forEach((l, i) => p2.drawText(latin(l), { x: ML + 10, y: y2 - 14 - i * 12, size: 9, font: normal, color: tinta }));

  pie(p2, "Anexo vinculado al comprobante individual. Proteger el archivo y las fotografías según los permisos del módulo de Madrid; no publicar enlaces directos.", "Pág. 2 / 2");
  marcaDeAgua(p2, bold, d.prueba);
  return pdf.save();
}
