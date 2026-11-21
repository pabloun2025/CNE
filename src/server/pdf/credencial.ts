import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PDFDocument, StandardFonts, TextRenderingMode, degrees, popGraphicsState, pushGraphicsState, rgb,
  setLineWidth, setStrokingColor, setTextRenderingMode, type PDFFont, type PDFImage, type PDFPage,
} from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";
import { CR80, MM, planchaA4, type MedidasCredencial } from "../../domain/credencial-layout";
import { ZONA_HEX, ZONA_NOMBRE, type Serie, type ZonaColor } from "../../domain/juntas";

export type DatosCredencial = { cedula: string; apellidos: string; nombres: string; cargo: string; rotulo: string; serie: Serie; zona: ZonaColor; prueba: boolean };

// El nombre «MODELO DE CREDENCIALES DE MJRV.pdf» no está en el repositorio.
// Claude cargó este archivo. Sus tres imágenes son las de la copia de trabajo del 19-11-2026.
// La credencial se arma con esas imágenes, no con un dibujo nuevo.
export const RUTA_MODELO_CREDENCIAL = path.join("insumos", "originales", "MODELO_DE_CREDENCIALES_DE_MJRV.pdf");

// WinAnsi: Latin-1 más guiones, comillas, viñeta, euro y puntos suspensivos.
const latin = (t: string) => t.replace(/[\u007f-\u009f]/g, " ").replace(/[^\u0020-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u20ac\u2026]/g, "?");
const negro = rgb(0, 0, 0);
const blanco = rgb(1, 1, 1);
const ZONAS_CLARAS = new Set<ZonaColor>(["amarillo", "celeste", "rosado"]);

// En el PDF van en este orden: logotipo, credencial de hombres, credencial de mujeres.
function imagenesDelModelo(): [Uint8Array, Uint8Array, Uint8Array] {
  const d = readFileSync(path.join(process.cwd(), RUTA_MODELO_CREDENCIAL));
  const out: Uint8Array[] = [];
  let i = 0;
  while (out.length < 3) {
    const s = d.indexOf(Buffer.from([0xff, 0xd8, 0xff]), i);
    const e = s < 0 ? -1 : d.indexOf(Buffer.from([0xff, 0xd9]), s + 2);
    if (s < 0 || e < 0) break;
    // pdf-lib ignora el desplazamiento que puede tener un Buffer de Node.
    out.push(Uint8Array.from(d.subarray(s, e + 2)));
    i = e + 2;
  }
  if (out.length < 3) throw new Error("El modelo de credencial no trae el logotipo y las dos credenciales.");
  return out as [Uint8Array, Uint8Array, Uint8Array];
}

type Caja = { x: number; y: number; w: number; h: number };
type Arte = { bold: PDFFont; logo: PDFImage; cuerpo: PDFImage; silueta: PDFImage; tinta: ReturnType<typeof rgb> };

// Coordenadas de las figuras en píxeles dentro de los JPEG del modelo.
const RECORTES_SILUETA = {
  H: { left: 408, top: 209, width: 104, height: 195 },
  M: { left: 353, top: 203, width: 109, height: 217 },
} as const;

async function tintarSilueta(modelo: Uint8Array, serie: Serie, color: Buffer): Promise<Buffer> {
  const recorte = RECORTES_SILUETA[serie];
  const pixeles = await sharp(modelo).extract(recorte).raw().toBuffer();
  for (let i = 0; i < pixeles.length; i += 3) {
    const gris = (pixeles[i] + pixeles[i + 1] + pixeles[i + 2]) / 3;
    // Conserva el fondo claro y gradúa el color en los bordes de la figura.
    if (gris >= 244) continue;
    const intensidad = Math.min(1, (255 - gris) / (255 - 42));
    for (let canal = 0; canal < 3; canal++) pixeles[i + canal] = Math.round(255 - (255 - color[canal]) * intensidad);
  }
  return sharp(pixeles, { raw: { width: recorte.width, height: recorte.height, channels: 3 } }).png().toBuffer();
}

// Fracciones del cuerpo del modelo (y desde arriba). Tapan el texto de muestra y dejan la figura y los bordes.
const TAPAS = {
  H: { rotulo: [0.007, 0.341, 0.739, 0.259], cargo: [0.007, 0.597, 0.765, 0.137], campos: [[0.034, 0.748, 0.933, 0.059], [0.034, 0.824, 0.933, 0.066], [0.034, 0.903, 0.933, 0.066]] },
  M: { rotulo: [0.032, 0.331, 0.655, 0.266], cargo: [0.032, 0.593, 0.659, 0.136], campos: [[0.039, 0.745, 0.923, 0.062], [0.039, 0.828, 0.923, 0.066], [0.039, 0.910, 0.923, 0.066]] },
} as const;

function cajaDe(img: Caja, fr: readonly [number, number, number, number]): Caja {
  return { x: img.x + fr[0] * img.w, y: img.y + img.h - (fr[1] + fr[3]) * img.h, w: fr[2] * img.w, h: fr[3] * img.h };
}

function escribir(page: PDFPage, caja: Caja, texto: string, font: PDFFont, max: number, color: ReturnType<typeof rgb>, escala: number) {
  const linea = latin(texto);
  const ancho = font.widthOfTextAtSize(linea, max * escala);
  const espacio = caja.w - 3 * escala;
  const size = max * escala * (ancho > espacio ? espacio / ancho : 1);
  const x = caja.x + (caja.w - font.widthOfTextAtSize(linea, size)) / 2;
  const y = caja.y + caja.h / 2 - size * 0.275;
  page.drawText(linea, { x, y, size, font, color });
}

// Marco del modelo: logotipo encima del cuerpo, en la proporción de la hoja de muestra.
const MARCO = { w: 190.8, h: 287.8, logo: { x: 8.4, y: 3.5, w: 174, h: 78.3 }, cuerpo: { y: 81.87, h: 206.2 } };

async function dibujar(pdf: PDFDocument, arte: Arte, d: DatosCredencial, medidas: MedidasCredencial): Promise<void> {
  const W = medidas.ancho * MM, H = medidas.alto * MM;
  const page = pdf.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: blanco, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.4 });

  const margen = Math.min(W, H, CR80.ancho * MM) * 3 / CR80.ancho;
  const marcoW = Math.min(W - margen, (H - margen) * MARCO.w / MARCO.h);
  const escala = marcoW / ((CR80.ancho - 3) * MM);
  const marcoH = marcoW * (MARCO.h / MARCO.w);
  const marcoX = (W - marcoW) / 2;
  const marcoTop = (H + marcoH) / 2;
  const logoW = marcoW * (MARCO.logo.w / MARCO.w);
  const logoH = marcoH * (MARCO.logo.h / MARCO.h);
  page.drawImage(arte.logo, {
    x: marcoX + marcoW * (MARCO.logo.x / MARCO.w),
    y: marcoTop - marcoH * (MARCO.logo.y / MARCO.h) - logoH,
    width: logoW,
    height: logoH,
  });

  const cuerpo = arte.cuerpo;
  const slotH = marcoH * (MARCO.cuerpo.h / MARCO.h);
  const slotW = marcoW;
  const slotTop = marcoTop - marcoH * (MARCO.cuerpo.y / MARCO.h);
  const esc = Math.min(slotW / cuerpo.width, slotH / cuerpo.height);
  const cw = cuerpo.width * esc, ch = cuerpo.height * esc;
  const img: Caja = { x: marcoX + (slotW - cw) / 2, y: slotTop - slotH + (slotH - ch) / 2, w: cw, h: ch };
  page.drawImage(cuerpo, { x: img.x, y: img.y, width: img.w, height: img.h });
  const recorte = RECORTES_SILUETA[d.serie];
  page.drawImage(arte.silueta, {
    x: img.x + recorte.left * esc,
    y: img.y + img.h - (recorte.top + recorte.height) * esc,
    width: recorte.width * esc,
    height: recorte.height * esc,
  });

  const tapas = TAPAS[d.serie];
  const rotulo = cajaDe(img, tapas.rotulo);
  const cargo = cajaDe(img, tapas.cargo);
  const campos = tapas.campos.map((f) => cajaDe(img, f));
  for (const fr of [rotulo, cargo, ...campos]) page.drawRectangle({ x: fr.x, y: fr.y, width: fr.w, height: fr.h, color: blanco });
  // El QR de la cédula va a la derecha de los tres datos, encima del modelo.
  // La altura es la de esos tres recuadros: así no tapa la figura del modelo. Tope 17 mm.
  const lado = Math.min(17 * MM * escala, campos[0].y + campos[0].h - campos[2].y);
  const qrX = img.x + img.w - lado - 1.2 * escala;
  const qrY = campos[2].y;
  const anchoTexto = qrX - campos[0].x - 2 * escala;
  const contorno = ZONAS_CLARAS.has(d.zona);
  if (contorno) {
    const { red, green, blue } = arte.tinta;
    page.pushOperators(pushGraphicsState(), setStrokingColor(rgb(red * 0.3, green * 0.3, blue * 0.3)),
      setLineWidth(0.9 * escala), setTextRenderingMode(TextRenderingMode.FillAndOutline));
  }
  escribir(page, { ...rotulo, y: rotulo.y + 6 * escala, h: rotulo.h - 6 * escala }, d.rotulo, arte.bold, 32, arte.tinta, escala);
  if (contorno) page.pushOperators(popGraphicsState());
  escribir(page, { ...rotulo, y: rotulo.y + 0.6 * escala, h: 8 * escala }, `Zona: ${ZONA_NOMBRE[d.zona]}`, arte.bold, 7.5, negro, escala);
  escribir(page, cargo, d.cargo, arte.bold, 11, negro, escala);
  campos.forEach((caja, i) => escribir(page, { ...caja, w: anchoTexto }, [d.apellidos, d.nombres, d.cedula][i].toUpperCase(), arte.bold, 7, negro, escala));

  if (d.prueba) {
    const size = 26 * escala;
    const w = arte.bold.widthOfTextAtSize("PRUEBA", size);
    page.drawText("PRUEBA", { x: W / 2 - (w / 2) * Math.SQRT1_2, y: H / 2 - (w / 2) * Math.SQRT1_2, size, font: arte.bold, color: rgb(0.85, 0, 0), opacity: 0.35, rotate: degrees(45) });
  }

  const qr = await pdf.embedPng(await QRCode.toBuffer(d.cedula, { margin: 1, width: 400, errorCorrectionLevel: "M" }));
  await qr.embed();
  const borde = 0.8 * escala;
  page.drawRectangle({ x: qrX - borde, y: qrY - borde, width: lado + 2 * borde, height: lado + 2 * borde, color: blanco });
  page.drawImage(qr, { x: qrX, y: qrY, width: lado, height: lado });
}

let imagenes: ReturnType<typeof imagenesDelModelo> | undefined;

async function documentoDeCredenciales(datos: DatosCredencial[], medidas: MedidasCredencial): Promise<PDFDocument> {
  const pdf = await PDFDocument.create();
  const [logo, hombre, mujer] = imagenes ??= imagenesDelModelo();
  const cabecera = { bold: await pdf.embedFont(StandardFonts.HelveticaBold), logo: await pdf.embedJpg(logo) };
  const cuerpos: Partial<Record<Serie, PDFImage>> = {};
  const siluetas: Partial<Record<`${Serie}-${ZonaColor}`, PDFImage>> = {};
  for (const d of datos) {
    const modelo = d.serie === "H" ? hombre : mujer;
    const cuerpo = cuerpos[d.serie] ??= await pdf.embedJpg(modelo);
    const color = Buffer.from(ZONA_HEX[d.zona].slice(1), "hex");
    const clave = `${d.serie}-${d.zona}` as const;
    const silueta = siluetas[clave] ??= await pdf.embedPng(await tintarSilueta(modelo, d.serie, color));
    const tinta = rgb(color[0] / 255, color[1] / 255, color[2] / 255);
    await dibujar(pdf, { ...cabecera, cuerpo, silueta, tinta }, d, medidas);
  }
  return pdf;
}

export async function credencialesIndividuales(datos: DatosCredencial[], medidas: MedidasCredencial = CR80): Promise<Uint8Array> {
  return (await documentoDeCredenciales(datos, medidas)).save();
}

// Solo se marcan los cortes de las credenciales impresas.
export async function hojasA4(datos: DatosCredencial[], medidas: MedidasCredencial = CR80): Promise<Uint8Array> {
  const tarjetas = await documentoDeCredenciales(datos, medidas);
  await tarjetas.flush();
  const hoja = await PDFDocument.create();
  const { papel, huecos } = planchaA4(medidas);
  const embebidas = await hoja.embedPages(tarjetas.getPages());
  const alto = papel.alto * MM;
  for (let inicio = 0; inicio < datos.length; inicio += huecos.length) {
    const page = hoja.addPage([papel.ancho * MM, alto]);
    huecos.slice(0, datos.length - inicio).forEach((h, i) => {
      const x = h.x * MM, y = alto - (h.y + h.h) * MM;
      const xOrigen = h.giro === 90 ? x + h.w * MM : x;
      page.drawPage(embebidas[inicio + i], { x: xOrigen, y, width: medidas.ancho * MM, height: medidas.alto * MM, rotate: degrees(h.giro) });
      page.drawRectangle({ x, y, width: h.w * MM, height: h.h * MM, borderColor: rgb(0.42, 0.42, 0.42), borderDashArray: [3, 2], borderWidth: 0.5 });
    });
  }
  return hoja.save();
}
