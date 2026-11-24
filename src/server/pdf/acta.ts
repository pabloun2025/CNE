import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { eurosEnLetras } from "../../domain/pago";
import { A4, MM } from "../../domain/credencial-layout";
import { RECIBOS_IMPORTE_USD, RECIBOS_TIPO_CAMBIO } from "../../domain/recibos";
import { FECHA_CONTINGENCIA } from "./fecha-recibo";

export type DatosActa = {
  numero: string;
  ordinalRecibo?: number | null;
  impresionN: number; // 1 = original; >1 = REIMPRESIÓN n
  prueba: boolean;
  borrador: boolean; // sin parámetros completos: sin cifras
  emitidaEn: Date;
  persona: {
    apellidos: string; nombres: string; cedula: string; cargo: string; juntaVigente: string;
    tipoDocumento?: "cedula" | "pasaporte";
    zona?: string | null; telefono?: string | null; correo?: string | null;
  };
  importe: { usd: string | null; eur: string | null; cambio?: string | null };
  pagador: { nombre: string; cargo: string } | null;
  anexo?: { anverso?: Buffer; reverso?: Buffer; pasaporte?: Buffer };
  reconstruido?: boolean;
  sinAnexo?: boolean;
  contingencia?: boolean;
  firmaReceptor?: Buffer;
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
const fechaMadrid = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short" });
const fechaRecibo = (d: DatosActa) => d.contingencia ? FECHA_CONTINGENCIA : fechaMadrid.format(d.emitidaEn);
const ESPACIO_MANUSCRITO = "____________";
const logoBytes = Uint8Array.from(readFileSync(join(process.cwd(), "src/server/pdf/logo-cne.jpg")));
// Logotipo del formulario oficial FO-04, extraído de la plantilla Word en blanco.
const logoOficialBytes = Uint8Array.from(readFileSync(join(process.cwd(), "src/server/pdf/logo-recibo-cne.png")));

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

export async function actaPago(d: DatosActa): Promise<Uint8Array> {
  if (d.ordinalRecibo == null && !d.sinAnexo) return actaHistorica(d);
  const plantilla = await prepararActaOficial();
  await agregarActaOficial(plantilla, d);
  return plantilla.pdf.save();
}

export async function actasContingencia(personas: DatosActa["persona"][], pagador: DatosActa["pagador"], prueba: boolean): Promise<Uint8Array> {
  const plantilla = await prepararActaOficial();
  const importe = { usd: RECIBOS_IMPORTE_USD, eur: null, cambio: RECIBOS_TIPO_CAMBIO };
  for (const persona of personas) await agregarActaOficial(plantilla, { manual: true, persona, pagador, prueba, importe });
  return plantilla.pdf.save();
}

async function prepararActaOficial() {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(logoOficialBytes);
  return { pdf, normal, bold, logo };
}

type ActaManual = Pick<DatosActa, "persona" | "pagador" | "prueba" | "importe"> & { manual: true };

async function agregarActaOficial({ pdf, normal, bold, logo }: Awaited<ReturnType<typeof prepararActaOficial>>, d: DatosActa | ActaManual) {
  const page = pdf.addPage([A4.alto * MM, A4.ancho * MM]);
  const negro = rgb(0, 0, 0);
  const blanco = rgb(1, 1, 1);
  const azulOficial = rgb(34 / 255, 61 / 255, 93 / 255);
  const izquierda = 42;
  const derecha = page.getWidth() - izquierda;
  const ancho = derecha - izquierda;
  const centro = izquierda + ancho / 2;
  const mitad = ancho / 2;

  const texto = (valor: string, x: number, y: number, disponible: number, opciones: {
    size?: number; font?: PDFFont; color?: typeof negro; alineacion?: "centro" | "derecha";
  } = {}) => {
    const { font = normal, color = negro, alineacion } = opciones;
    const limpio = latin(valor);
    if (!limpio) return;
    const base = opciones.size ?? 9;
    const anchoTexto = font.widthOfTextAtSize(limpio, base);
    const size = anchoTexto > disponible ? base * (disponible / anchoTexto) : base;
    const espacio = disponible - font.widthOfTextAtSize(limpio, size);
    const margen = alineacion === "centro" ? espacio / 2 : alineacion === "derecha" ? espacio : 0;
    page.drawText(limpio, { x: x + margen, y, size, font, color });
  };
  const trazo = (x: number, y: number, x2: number, y2: number, punteado = false) => {
    page.drawLine({ start: { x, y }, end: { x: x2, y: y2 }, thickness: 0.6, color: negro,
      ...(punteado ? { dashArray: [1, 2] } : {}) });
  };
  const campo = (x: number, y: number, etiqueta: string, valor?: string | null) => {
    const inicioValor = x + bold.widthOfTextAtSize(etiqueta, 8) + 7;
    texto(etiqueta, x, y, mitad - 14, { font: bold, size: 8 });
    texto(valor ?? "", inicioValor, y, mitad - (inicioValor - x) - 14);
    trazo(inicioValor, y - 2.5, x + mitad - 14, y - 2.5, true);
  };

  page.drawImage(logo, { x: izquierda, y: 511, width: 89, height: 89 * logo.height / logo.width });
  texto("COORDINACIÓN NACIONAL TÉCNICA DE PROCESOS ELECTORALES", centro, 549, mitad, { font: bold, alineacion: "derecha" });
  texto("DIRECCIÓN DE PROCESOS EN EL EXTERIOR", centro, 536, mitad, { font: bold, alineacion: "derecha" });
  texto("RECIBO DE PAGO - MJRV", izquierda, 509, ancho, { font: bold, size: 15, alineacion: "centro" });
  texto("PROCESO: ELECCIONES SECCIONALES Y CPCCS 2027", izquierda, 488, ancho, { font: bold, size: 11, alineacion: "centro" });

  const manual = "manual" in d;
  const sinAnexo = manual || d.sinAnexo;
  const fondoTabla = sinAnexo ? 66 : 204;
  const lineaFirma = sinAnexo ? 108 : 218;
  const numero = manual ? ESPACIO_MANUSCRITO : d.impresionN > 1 ? `${d.numero} · REIMPRESIÓN ${d.impresionN}` : d.numero;
  const avisos = manual ? "CONTINGENCIA · PARA COMPLETAR A MANO"
    : [d.borrador && "BORRADOR", d.reconstruido && "COPIA RECONSTRUIDA", d.contingencia && "EMISIÓN DE CONTINGENCIA"].filter(Boolean).join(" · ");
  const fecha = manual ? `FECHA: ${FECHA_CONTINGENCIA}` : `EMISIÓN: ${fechaRecibo(d)}`;
  texto(avisos, izquierda, 467, mitad, { font: bold, size: 8 });
  texto(`NRO. ${numero}   |   ${fecha}`, centro, 467, mitad, { font: bold, alineacion: "derecha" });

  page.drawRectangle({ x: izquierda, y: 344, width: ancho, height: 22, color: azulOficial });
  page.drawRectangle({ x: izquierda, y: fondoTabla, width: ancho, height: 456 - fondoTabla, borderWidth: 0.6, borderColor: negro });
  for (const y of [435, 414, 366, 344, 322, 282]) trazo(izquierda, y, derecha, y);
  trazo(izquierda, 302, centro, 302);
  trazo(centro, fondoTabla, centro, 366);
  trazo(centro, 414, centro, 456);

  campo(izquierda + 8, 443, "CIRCUNSCRIPCIÓN:", "Europa, Asia y Oceanía");
  campo(centro + 8, 443, "PAÍS:", "España");
  campo(izquierda + 8, 422, "OFICINA CONSULAR:", "Consulado General del Ecuador en Madrid");
  campo(centro + 8, 422, "ZONA:", "Madrid");

  const nombre = `${d.persona.nombres} ${d.persona.apellidos}`.trim();
  const usd = d.importe.usd?.replace(".", ",") ?? "________";
  const eur = d.importe.eur?.replace(".", ",") ?? (manual ? ESPACIO_MANUSCRITO : "________");
  const cambio = d.importe.cambio?.replace(".", ",") ?? "________";
  texto(`Yo, ${nombre}, con cédula Nro. ${d.persona.cedula}, declaro haber recibido USD ${usd},`, izquierda + 8, 399, ancho - 16);
  texto(`por haber participado en la Junta Receptora del Voto Nro. ${d.persona.juntaVigente} con el nombramiento de ${d.persona.cargo}.`, izquierda + 8, 386, ancho - 16);
  texto(`Importe entregado: EUR ${eur}    ·    Tipo de cambio (USD por EUR): ${cambio}`, izquierda + 8, 373, ancho - 16, { font: bold });

  texto("RECIBÍ CONFORME", izquierda, 351, mitad, { font: bold, color: blanco, size: 10, alineacion: "centro" });
  texto("ENTREGUÉ CONFORME", centro, 351, mitad, { font: bold, color: blanco, size: 10, alineacion: "centro" });
  campo(izquierda + 8, 330, "DIRECCIÓN DOMICILIARIA:", "Madrid");
  campo(izquierda + 8, 309, "NÚMERO DE TELÉFONO:", d.persona.telefono);
  campo(izquierda + 8, 289, "CORREO ELECTRÓNICO:", d.persona.correo);
  campo(centro + 8, 330, "NOMBRE Y APELLIDO:", d.pagador?.nombre);
  campo(centro + 8, 299, "CARGO:", d.pagador?.cargo);
  texto("FIRMA DEL CIUDADANO:", izquierda, 270, mitad, { font: bold, size: 8, alineacion: "centro" });
  texto("FIRMA Y SELLO DEL CÓNSUL O RESPONSABLE CONSULAR:", centro, 270, mitad, { font: bold, size: 8, alineacion: "centro" });
  trazo(izquierda + 8, lineaFirma, centro - 8, lineaFirma, true);
  trazo(centro + 8, lineaFirma, derecha - 8, lineaFirma, true);

  const anchoMarco = mitad - 6;
  const fotos = sinAnexo ? [] : d.persona.tipoDocumento === "pasaporte" ? [
    ["PÁGINA DE DATOS DEL PASAPORTE", centro - anchoMarco / 2, d.anexo?.pasaporte],
  ] as const : [
    ["ANVERSO DE LA CÉDULA", izquierda, d.anexo?.anverso],
    ["REVERSO DE LA CÉDULA", centro + 6, d.anexo?.reverso],
  ] as const;
  for (const [titulo, x, archivo] of fotos) {
    texto(titulo, x, 188, anchoMarco, { font: bold, alineacion: "centro" });
    page.drawRectangle({ x, y: 40, width: anchoMarco, height: 139, borderWidth: 0.6, borderColor: negro });
    if (archivo) {
      const img = await pdf.embedJpg(archivo);
      const dimensiones = img.scaleToFit(anchoMarco - 10, 129);
      page.drawImage(img, { x: x + (anchoMarco - dimensiones.width) / 2, y: 40 + (139 - dimensiones.height) / 2, ...dimensiones });
    }
  }

  texto("Código: FO-04(PE-PX-SU-02); Versión: 2", izquierda, 23, ancho, { size: 8 });
  marcaDeAgua(page, bold, d.prueba);
}

// Conserva el formato de las actas emitidas antes del recibo oficial.
async function actaHistorica(d: DatosActa): Promise<Uint8Array> {
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
  if (d.reconstruido) {
    p1.drawText(latin("COPIA RECONSTRUIDA · VERIFIQUE LOS DATOS CON LA FICHA ACTUAL"), { x: ML, y, size: 8, font: bold, color: suave });
    y -= 12;
  }
  if (d.contingencia) {
    p1.drawText(latin("EMISIÓN DE CONTINGENCIA · SIN CONFIRMACIÓN DE PAGO NI VALIDACIÓN DE CÉDULA"), { x: ML, y, size: 8, font: bold, color: suave });
    y -= 12;
  }
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
  campo(ML + mitad, y - hCampo, mitad, hCampo, "FECHA DE EMISIÓN", fechaRecibo(d));
  caja(ML, y - hCampo, mitad, hCampo, true, false);
  y -= hCampo + 5 * MM;

  seccion("DATOS DEL MIEMBRO DE JUNTA");
  const esPasaporte = d.persona.tipoDocumento === "pasaporte";
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
  p1.drawRectangle({ x: ML, y: y - hKpi, width: ancho, height: hKpi, color: fondoEur, borderColor: linea, borderWidth: 0.6 });
  caja(ML, y - hKpi, mitad, hKpi, true, false);
  const importes = [
    { etiqueta: "VALOR DE REFERENCIA (USD)", monto: d.importe.usd ? `USD ${d.importe.usd}` : null },
    { etiqueta: "IMPORTE ENTREGADO (EUR)", monto: d.importe.eur ? `EUR ${d.importe.eur}` : null },
  ];
  importes.forEach(({ etiqueta, monto }, i) => {
    const x = ML + i * mitad;
    p1.drawText(etiqueta, { x: x + (mitad - normal.widthOfTextAtSize(etiqueta, 7.5)) / 2, y: y - 14, size: 7.5, font: normal, color: suave });
    if (monto) p1.drawText(monto, { x: x + (mitad - bold.widthOfTextAtSize(monto, 13)) / 2, y: y - hKpi + 10, size: 13, font: bold, color: azul });
  });
  y -= hKpi + 5 * MM;

  const declaracion = d.borrador || !d.importe.eur
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

  let firmaImg: PDFImage | null = null;
  if (d.firmaReceptor) {
    try { firmaImg = await pdf.embedPng(d.firmaReceptor); } catch { firmaImg = null; }
  }
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
    if (i === 1 && firmaImg) {
      const alto = 16 * MM;
      const anchoImg = Math.min(anchoFirma - 6 * MM, (firmaImg.width / firmaImg.height) * alto);
      p1.drawImage(firmaImg, { x: x + (anchoFirma - anchoImg) / 2, y: y + 1.5 * MM, width: anchoImg, height: alto });
    }
    p1.drawLine({ start: { x, y }, end: { x: x + anchoFirma, y }, thickness: 0.8, color: suave });
    centrado(f[0], x, y - 16, bold, 9);
    if (f[1]) centrado(f[1], x, y - 28, normal, 9);
    centrado(f[2], x, y - (f[1] ? 40 : 28), normal, 9);
  });

  const { anverso, reverso, pasaporte } = d.anexo ?? {};
  const fotos = esPasaporte
    ? pasaporte ? [["PÁGINA DE DATOS DEL PASAPORTE", pasaporte]] as const : []
    : anverso && reverso ? [["ANVERSO · CÉDULA DE IDENTIDAD", anverso], ["REVERSO · CÉDULA DE IDENTIDAD", reverso]] as const : [];
  pie(p1, "El recibo se firma tras la entrega física del efectivo. Su impresión no equivale a pago confirmado en el sistema. El registro electrónico del desembolso se realiza después de la entrega.", fotos.length ? "Pág. 1 / 2" : d.reconstruido ? "Copia reconstruida" : "Pág. 1 / 1");
  marcaDeAgua(p1, bold, d.prueba);
  if (!fotos.length) return pdf.save();

  const p2 = pdf.addPage([W, H]);
  let y2 = encabezado(p2, ["CONSULADO GENERAL DEL", "ECUADOR EN MADRID", "Anexo de identidad · Jornada 2026"]);
  y2 -= 13 * MM;
  p2.drawText("MODELO DE TRABAJO · ANEXO AL RECIBO", { x: ML, y: y2, size: 8, font: bold, color: suave });
  y2 -= 18;
  p2.drawText("ANEXO — DOCUMENTO DE IDENTIDAD", { x: ML, y: y2, size: 16, font: bold, color: marino });
  y2 -= 16;
  const intro = partir(`${esPasaporte ? "Página de datos del pasaporte vinculado" : "Anverso y reverso de la cédula vinculada"} a la ficha del MJRV y al comprobante ${d.numero}.`, normal, 9.5, ancho);
  intro.forEach((l) => { p2.drawText(latin(l), { x: ML, y: y2, size: 9.5, font: normal, color: suave }); y2 -= 12; });
  y2 -= 6 * MM;

  const altoImg = 58 * MM;
  for (const [rotulo, buf] of fotos) {
    const altoPanel = 8 * MM + altoImg;
    p2.drawRectangle({ x: ML, y: y2 - altoPanel, width: ancho, height: altoPanel, borderColor: linea, borderWidth: 0.8 });
    p2.drawRectangle({ x: ML, y: y2 - 8 * MM, width: ancho, height: 8 * MM, color: fondo });
    p2.drawText(rotulo, { x: ML + 8, y: y2 - 5.2 * MM, size: 9, font: bold, color: azul });
    const img: PDFImage = await pdf.embedJpg(Uint8Array.from(buf));
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
