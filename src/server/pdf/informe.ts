import { PDFDocument, StandardFonts, breakTextIntoLines, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { A4, MM } from "../../domain/credencial-layout";
import { COLUMNAS_INFORME, COLUMNAS_PREDETERMINADAS, horaDeCorte, resumenTotales, type DatosInforme, type IdColumnaInforme } from "../../domain/informe";

const latin = (t: string) => t.normalize("NFC").replace(/\s/g, " ").replace(/[^ -~\u00a0-\u00ff–—‘’“”•€…]/g, "?");

// Informe apaisado, sin fotos (§13.9). El total solo suma confirmaciones.
export async function informeCierrePdf(d: DatosInforme, seleccion: readonly IdColumnaInforme[] = COLUMNAS_PREDETERMINADAS): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = A4.alto * MM, H = A4.ancho * MM, M = 30; // apaisado
  const columnas = seleccion.map((id) => COLUMNAS_INFORME[id]);
  const anchoTotal = columnas.reduce((suma, c) => suma + c.anchoPdf, 0);
  const escala = anchoTotal > W - 2 * M ? (W - 2 * M) / anchoTotal : 1;
  const anchos = columnas.map((c) => c.anchoPdf * escala);
  const altoLinea = 10;
  const totales = resumenTotales(d.filas, d.totalEur);
  const negro = rgb(0.1, 0.1, 0.1);
  let page!: PDFPage;
  let y = 0;
  let n = 0;

  const prepararFila = (celdas: (string | number)[], fuente: PDFFont, size: number) => celdas.map((valor, i) => {
    const texto = latin(typeof valor === "number" ? valor.toFixed(2) : valor);
    const ancho = anchos[i] - 4;
    const medir = (t: string) => fuente.widthOfTextAtSize(t, size);
    return breakTextIntoLines(texto, [" "], ancho, medir).flatMap((linea) =>
      medir(linea) <= ancho ? [linea] : breakTextIntoLines(linea, [""], ancho, medir));
  });
  const altoFila = (celdas: string[][]) => Math.max(1, ...celdas.map((lineas) => lineas.length)) * altoLinea + 4;
  const fila = (celdas: string[][], fuente: PDFFont, size: number) => {
    let x = M;
    celdas.forEach((lineas, i) => {
      lineas.forEach((linea, j) => page.drawText(linea, { x: x + 2, y: y - j * altoLinea, size, font: fuente, color: negro }));
      x += anchos[i];
    });
    y -= altoFila(celdas);
  };
  const separador = () => {
    page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.5, color: negro });
  };
  const encabezado = prepararFila(columnas.map((c) => c.titulo), bold, 8);
  const nuevaPagina = (conTabla: boolean) => {
    page = pdf.addPage([W, H]);
    n++;
    if (d.modoPrueba) {
      const t = "PRUEBA — SIN VALIDEZ";
      page.drawText(latin(t), { x: W / 2 - 230, y: H / 2 - 170, size: 44, font: bold, color: rgb(0.85, 0, 0), opacity: 0.15, rotate: degrees(25) });
    }
    y = H - M;
    page.drawText("Informe de cierre de finanzas · Madrid", { x: M, y, size: 14, font: bold, color: negro });
    y -= 16;
    page.drawText(latin(`Elecciones Seccionales y CPCCS 2027 · Jornada del 29 de noviembre de 2026 · Hora de corte: ${horaDeCorte(d.generadoEn)} (Madrid)`), { x: M, y, size: 9, font: normal, color: negro });
    y -= 14;
    if (conTabla) {
      fila(encabezado, bold, 8);
      separador();
      y -= 4;
    }
  };

  nuevaPagina(columnas.length > 0);
  if (columnas.length > 0) {
    for (const f of d.filas) {
      const celdas = prepararFila(columnas.map((c) => c.valor(f)), normal, 8);
      if (y - altoFila(celdas) < M) nuevaPagina(true);
      fila(celdas, normal, 8);
    }
  }
  if (y < M + 64) nuevaPagina(false);
  y -= 8;
  separador();
  const linea = (t: string, f = normal) => { page.drawText(latin(t), { x: M, y, size: 10, font: f, color: negro }); y -= 14; };
  linea(`Personas: ${totales.personas} · Pagadas: ${totales.pagadas} · Pendientes: ${totales.pendientes}`);
  linea(`TOTAL ENTREGADO: ${totales.totalEur} EUR (solo pagos confirmados).`, bold);
  if (totales.pagosSinImporteEur > 0) linea(`Pagos confirmados sin importe EUR: ${totales.pagosSinImporteEur}.`);
  if (d.modoPrueba) linea("Informe de PRUEBA: las confirmaciones son simuladas y no implican entrega de dinero.", bold);
  pdf.getPages().forEach((p, i) => p.drawText(`Página ${i + 1} de ${n}`, { x: W - M - 70, y: 14, size: 8, font: normal, color: negro }));
  return pdf.save();
}
