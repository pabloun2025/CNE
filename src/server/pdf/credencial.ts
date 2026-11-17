import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { A4, CR80, MM, POR_HOJA, huecosA4 } from "../../domain/credencial-layout";

export type DatosCredencial = { cedula: string; apellidos: string; nombres: string; cargo: string; rotulo: string; serie: "H" | "M"; prueba: boolean };

// Helvetica solo codifica WinAnsi: lo demás se sustituye para no romper la generación.
const latin = (t: string) => t.replace(/[^ -ÿ]/g, "?");
const AZUL = rgb(0x1f / 255, 0x5f / 255, 0xa8 / 255);
const NARANJA = rgb(0xf4 / 255, 0xb1 / 255, 0x83 / 255);
const ROJO = rgb(0xe0 / 255, 0, 0);

// Ajusta el tamaño de letra para que el texto quepa en `ancho` pt; hasta 2 líneas si `lineas` = 2.
function ajustar(texto: string, fuente: PDFFont, ancho: number, max: number, min: number, lineas: number): { size: number; lineas: string[] } {
  for (let size = max; size >= min; size -= 0.25) {
    const ls = partir(texto, fuente, size, ancho);
    if (ls.length <= lineas) return { size, lineas: ls };
  }
  return { size: min, lineas: partir(texto, fuente, min, ancho).slice(0, lineas) };
}
function partir(texto: string, fuente: PDFFont, size: number, ancho: number): string[] {
  const out: string[] = [];
  let actual = "";
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const siguiente = actual ? `${actual} ${palabra}` : palabra;
    if (actual && fuente.widthOfTextAtSize(siguiente, size) > ancho) { out.push(actual); actual = palabra; } else actual = siguiente;
  }
  if (actual) out.push(actual);
  return out.length ? out : [""];
}

let logoCache: Uint8Array | null = null;
async function logoBytes(): Promise<Uint8Array> {
  logoCache ??= await readFile(path.join(process.cwd(), "public", "marca", "cne-elecciones-2027.jpg"));
  return logoCache;
}

// Pictograma vectorial masculino/femenino (9 × 17 mm) dentro de la caja (x, yArriba) en mm.
function pictograma(page: PDFPage, serie: "H" | "M", x: number, yArriba: number, color: ReturnType<typeof rgb>, H: number) {
  const cx = (x + 4.5) * MM;
  const py = (mm: number) => H - mm * MM;
  page.drawCircle({ x: cx, y: py(yArriba + 2.2), size: 2.2 * MM, color });
  if (serie === "H") {
    page.drawRectangle({ x: cx - 3 * MM, y: py(yArriba + 12), width: 6 * MM, height: 8.6 * MM, color });
    page.drawRectangle({ x: cx - 2 * MM, y: py(yArriba + 17), width: 1.6 * MM, height: 5 * MM, color });
    page.drawRectangle({ x: cx + 0.4 * MM, y: py(yArriba + 17), width: 1.6 * MM, height: 5 * MM, color });
  } else {
    page.drawSvgPath(`M 0 0 L ${-4 * MM} ${9 * MM} L ${4 * MM} ${9 * MM} Z`, { x: cx, y: py(yArriba + 4.8), color });
    page.drawRectangle({ x: cx - 1.8 * MM, y: py(yArriba + 17), width: 1.4 * MM, height: 4 * MM, color });
    page.drawRectangle({ x: cx + 0.4 * MM, y: py(yArriba + 17), width: 1.4 * MM, height: 4 * MM, color });
  }
}

type Recursos = { bold: PDFFont; logo: Awaited<ReturnType<PDFDocument["embedJpg"]>> };

async function dibujar(pdf: PDFDocument, rec: Recursos, d: DatosCredencial): Promise<void> {
  const W = CR80.ancho * MM, H = CR80.alto * MM;
  const page = pdf.addPage([W, H]);
  const Y = (mm: number) => H - mm * MM; // desde arriba
  const negro = rgb(0, 0, 0);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.4 });

  // 3–21 mm: logotipo (ancho 46 mm).
  const lw = 46 * MM, lh = (rec.logo.height / rec.logo.width) * lw;
  page.drawImage(rec.logo, { x: 4 * MM, y: Y(3) - lh, width: lw, height: lh });

  // 22–35 mm: banda azul con cuatro líneas.
  page.drawRectangle({ x: 3 * MM, y: Y(35), width: 48 * MM, height: 13 * MM, color: AZUL });
  ["MIEMBRO", "DE JUNTA", "RECEPTORA", "DEL VOTO"].forEach((t, i) => {
    const w = rec.bold.widthOfTextAtSize(t, 8.5);
    page.drawText(t, { x: (W - w) / 2, y: Y(22) - 8.4 - i * 8.6, size: 8.5, font: rec.bold, color: rgb(1, 1, 1) });
  });

  // 36–54 mm: rótulo grande (negro hombres, rojo mujeres) y pictograma.
  const color = d.serie === "M" ? ROJO : negro;
  const rotulo = latin(d.rotulo.toUpperCase());
  const { size } = ajustar(rotulo, rec.bold, 34 * MM, 40, 8, 1);
  page.drawText(rotulo, { x: 3 * MM, y: Y(36) - 0.8 * size - (18 * MM - size) / 2 + 2, size, font: rec.bold, color });
  pictograma(page, d.serie, 42, 36.5, color, H);

  // 55–60 mm: cargo.
  const cargo = latin(d.cargo.toUpperCase());
  const c = ajustar(cargo, rec.bold, 48 * MM, 9, 5, 1);
  page.drawText(c.lineas[0], { x: (W - rec.bold.widthOfTextAtSize(c.lineas[0], c.size)) / 2, y: Y(59), size: c.size, font: rec.bold, color: negro });

  // 61–83 mm: tres recuadros con los datos y QR de 17 × 17 mm con la cédula.
  const valores = [d.apellidos, d.nombres, d.cedula];
  valores.forEach((v, i) => {
    const top = 61 + i * 7.8;
    page.drawRectangle({ x: 3 * MM, y: Y(top + 6.8), width: 30.5 * MM, height: 6.8 * MM, borderColor: NARANJA, borderWidth: 0.8 });
    const a = ajustar(latin(v.toUpperCase()), rec.bold, 28.5 * MM, 7, 5, 2);
    const alto = a.lineas.length * a.size * 1.05;
    a.lineas.forEach((l, j) => page.drawText(l, { x: 4 * MM, y: Y(top + 3.4) + alto / 2 - a.size * 0.8 - j * a.size * 1.05, size: a.size, font: rec.bold, color: negro }));
  });
  const qr = await pdf.embedPng(await QRCode.toBuffer(d.cedula, { margin: 1, width: 400, errorCorrectionLevel: "M" }));
  page.drawImage(qr, { x: 34.5 * MM, y: Y(61 + 17), width: 17 * MM, height: 17 * MM });

  if (d.prueba) {
    const w = rec.bold.widthOfTextAtSize("PRUEBA", 30);
    page.drawText("PRUEBA", { x: W / 2 - (w / 2) * Math.SQRT1_2, y: H / 2 - (w / 2) * Math.SQRT1_2, size: 30, font: rec.bold, color: rgb(0.85, 0, 0), opacity: 0.35, rotate: degrees(45) });
  }
}

async function documentoDeCredenciales(datos: DatosCredencial[]): Promise<PDFDocument> {
  const pdf = await PDFDocument.create();
  const rec: Recursos = { bold: await pdf.embedFont(StandardFonts.HelveticaBold), logo: await pdf.embedJpg(await logoBytes()) };
  for (const d of datos) await dibujar(pdf, rec, d);
  return pdf;
}

// Una página de 54 × 85,6 mm por persona.
export async function credencialesIndividuales(datos: DatosCredencial[]): Promise<Uint8Array> {
  return (await documentoDeCredenciales(datos)).save();
}

// Hojas A4 con 10 credenciales giradas 90°, líneas de corte grises de 0,2 pt en los bordes de cada hueco.
export async function hojasA4(datos: DatosCredencial[]): Promise<Uint8Array> {
  // Se guarda y se vuelve a cargar: embeber un documento aún en memoria deja referencias rotas.
  const tarjetas = await PDFDocument.load(await (await documentoDeCredenciales(datos)).save());
  const hoja = await PDFDocument.create();
  const huecos = huecosA4();
  const embebidas = await hoja.embedPdf(tarjetas, datos.map((_, i) => i));
  const alto = A4.alto * MM;
  for (let inicio = 0; inicio < datos.length; inicio += POR_HOJA) {
    const page = hoja.addPage([A4.ancho * MM, alto]);
    huecos.forEach((h, i) => {
      const e = embebidas[inicio + i];
      // Giro de 90° antihorario alrededor de la esquina inferior izquierda: el punto de anclaje es la esquina inferior derecha del hueco.
      if (e) page.drawPage(e, { x: (h.x + h.w) * MM, y: alto - (h.y + h.h) * MM, width: CR80.ancho * MM, height: CR80.alto * MM, rotate: degrees(90) });
      page.drawRectangle({ x: h.x * MM, y: alto - (h.y + h.h) * MM, width: h.w * MM, height: h.h * MM, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.2 });
    });
  }
  return hoja.save();
}
