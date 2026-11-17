import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { A4, MM } from "../../domain/credencial-layout";

export type DatosActa = {
  numero: string; // MAD-000123 · PRUEBA-000123
  impresionN: number; // 1 = original; >1 = REIMPRESIÓN n
  prueba: boolean;
  borrador: boolean; // sin parámetros completos: sin cifras
  lugar: string | null;
  emitidaEn: Date;
  operador: string;
  persona: { apellidos: string; nombres: string; cedula: string; cargo: string; juntaOrigen: string; juntaVigente: string };
  importe: { usd: string; cambio: string; sentido: string; eur: string; redondeo: string; decimales: number } | null;
  pagador: { nombre: string; cargo: string } | null;
  anverso: Buffer;
  reverso: Buffer;
};

// WinAnsi: Latin-1 más guiones, comillas, viñeta, euro y puntos suspensivos.
const latin = (t: string) => t.replace(/[^\u0020-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u20ac\u2026]/g, "?");
const fechaMadrid = (d: Date) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" }).format(d);

function partir(texto: string, f: PDFFont, size: number, ancho: number): string[] {
  const out: string[] = [];
  let actual = "";
  for (const palabra of latin(texto).split(/\s+/).filter(Boolean)) {
    const sig = actual ? `${actual} ${palabra}` : palabra;
    if (actual && f.widthOfTextAtSize(sig, size) > ancho) { out.push(actual); actual = palabra; } else actual = sig;
  }
  if (actual) out.push(actual);
  return out;
}

function marcaDeAgua(page: PDFPage, f: PDFFont, prueba: boolean) {
  if (!prueba) return;
  const t = "PRUEBA — SIN VALIDEZ";
  const size = 54;
  const w = f.widthOfTextAtSize(latin(t), size);
  page.drawText(latin(t), { x: page.getWidth() / 2 - (w / 2) * Math.SQRT1_2, y: page.getHeight() / 2 - (w / 2) * Math.SQRT1_2, size, font: f, color: rgb(0.85, 0, 0), opacity: 0.18, rotate: degrees(45) });
}

// Recibo provisional de 2 páginas (02 §C.8). Imprimir no registra el pago.
export async function actaPago(d: DatosActa): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = A4.ancho * MM, H = A4.alto * MM, M = 48;
  const negro = rgb(0.1, 0.1, 0.1);

  const p1 = pdf.addPage([W, H]);
  p1.drawRectangle({ x: 0, y: H - 36, width: W, height: 36, color: rgb(0.85, 0.85, 0.85) });
  const banda = "MODELO PROVISIONAL — PENDIENTE DE APROBACIÓN";
  p1.drawText(latin(banda), { x: (W - bold.widthOfTextAtSize(latin(banda), 11)) / 2, y: H - 24, size: 11, font: bold, color: negro });
  let y = H - 70;
  const linea = (t: string, size = 11, f = normal, x = M) => { p1.drawText(latin(t), { x, y, size, font: f, color: negro }); y -= size + 6; };
  const titulo = "RECIBO DE PAGO A MIEMBRO DE JUNTA RECEPTORA DEL VOTO";
  p1.drawText(titulo, { x: (W - bold.widthOfTextAtSize(titulo, 14)) / 2, y, size: 14, font: bold, color: negro }); y -= 22;
  const sub = "Elecciones Seccionales y CPCCS 2027 · Jornada del 29 de noviembre de 2026 · Madrid";
  p1.drawText(latin(sub), { x: (W - normal.widthOfTextAtSize(latin(sub), 10)) / 2, y, size: 10, font: normal, color: negro }); y -= 30;

  linea("1 · Datos del recibo", 12, bold);
  linea(`Número interno: ${d.numero}`);
  linea(`Lugar: ${d.lugar ?? "(pendiente)"}`);
  linea(`Fecha y hora de emisión (Madrid): ${fechaMadrid(d.emitidaEn)}`);
  linea(d.impresionN > 1 ? `REIMPRESIÓN ${d.impresionN}` : "Original", 11, bold);
  y -= 8;
  linea("2 · Persona receptora", 12, bold);
  linea(`Apellidos: ${d.persona.apellidos}`);
  linea(`Nombres: ${d.persona.nombres}`);
  linea(`Cédula: ${d.persona.cedula}`);
  linea(`Cargo según registro: ${d.persona.cargo}`);
  linea(`Junta asignada: ${d.persona.juntaOrigen}${d.persona.juntaVigente !== d.persona.juntaOrigen ? ` · Junta de trabajo vigente: ${d.persona.juntaVigente}` : ""}`);
  y -= 8;
  linea("3 · Importe", 12, bold);
  if (d.borrador || !d.importe) {
    linea("IMPORTE PENDIENTE DE APROBACIÓN — BORRADOR", 13, bold);
  } else {
    const i = d.importe;
    linea(`Importe de referencia: ${i.usd} USD`);
    linea(`Tipo de cambio aplicado: ${i.sentido === "eur_por_usd" ? `1 USD = ${i.cambio} EUR` : `1 EUR = ${i.cambio} USD`}`);
    linea(`Importe entregado: ${i.eur} EUR`, 13, bold);
    linea(`Regla de redondeo: ${i.redondeo}; ${i.decimales === 0 ? "euros enteros" : "2 decimales"}`, 10);
  }
  y -= 8;
  linea("4 · Declaración", 12, bold);
  for (const l of partir("La persona receptora declara recibir en efectivo el importe indicado en euros.", normal, 11, W - 2 * M)) linea(l);
  y -= 8;
  linea("5 · Firmas", 12, bold);
  const caja = (x: number, rotulo: string, l1: string, l2: string) => {
    p1.drawRectangle({ x, y: y - 100, width: (W - 3 * M) / 2, height: 100, borderColor: negro, borderWidth: 0.8 });
    p1.drawText(latin(rotulo), { x: x + 6, y: y - 14, size: 10, font: bold, color: negro });
    p1.drawText(latin(l1), { x: x + 6, y: y - 88, size: 9, font: normal, color: negro });
    p1.drawText(latin(l2), { x: x + 6, y: y - 98 + 0, size: 8, font: normal, color: negro });
  };
  const pag = d.pagador ?? { nombre: "(pendiente)", cargo: "(pendiente)" };
  caja(M, "Pagador", pag.nombre.slice(0, 48), pag.cargo.slice(0, 60));
  caja(M + (W - 3 * M) / 2 + M, "Receptor", `${d.persona.apellidos}, ${d.persona.nombres}`.slice(0, 48), `Cédula ${d.persona.cedula}`);
  p1.drawText(latin(`Generado por el sistema operativo de Madrid el ${fechaMadrid(d.emitidaEn)} por ${d.operador}. La impresión de este documento no registra el pago.`), { x: M, y: 30, size: 7.5, font: normal, color: rgb(0.3, 0.3, 0.3) });
  marcaDeAgua(p1, bold, d.prueba);

  // Página 2: anexo con el documento de identidad, descifrado solo en memoria.
  const p2 = pdf.addPage([W, H]);
  p2.drawText("ANEXO — DOCUMENTO DE IDENTIDAD", { x: M, y: H - 60, size: 14, font: bold, color: negro });
  p2.drawText(latin(`${d.persona.apellidos}, ${d.persona.nombres} · Cédula ${d.persona.cedula} · Recibo ${d.numero}`), { x: M, y: H - 80, size: 10, font: normal, color: negro });
  const anchoImg = 120 * MM, altoImg = 76 * MM;
  let yy = H - 110;
  for (const [rotulo, buf] of [["Anverso", d.anverso], ["Reverso", d.reverso]] as const) {
    p2.drawText(rotulo, { x: M, y: yy, size: 11, font: bold, color: negro });
    const img = await pdf.embedJpg(buf);
    const esc = Math.min(anchoImg / img.width, altoImg / img.height);
    p2.drawImage(img, { x: M, y: yy - 8 - img.height * esc, width: img.width * esc, height: img.height * esc });
    yy -= altoImg + 50;
  }
  p2.drawRectangle({ x: 0, y: H - 36, width: W, height: 36, color: rgb(0.85, 0.85, 0.85) });
  p2.drawText(latin(banda), { x: (W - bold.widthOfTextAtSize(latin(banda), 11)) / 2, y: H - 24, size: 11, font: bold, color: negro });
  marcaDeAgua(p2, bold, d.prueba);
  return pdf.save();
}
