import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { A4, MM } from "../../domain/credencial-layout";
import { COLUMNAS_INFORME, filaComoTexto, horaDeCorte, resumenTotales, type FilaInforme } from "../../domain/informe";

export type DatosInforme = { generadoEn: string; modoPrueba: boolean; totalEur: string; filas: FilaInforme[] };

const latin = (t: string) => t.replace(/[^ -ÿ–—‘’“”•€…]/g, "?");

// Informe apaisado, sin fotos (§13.9). El total solo suma confirmaciones.
export async function informeCierrePdf(d: DatosInforme): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = A4.alto * MM, H = A4.ancho * MM, M = 30; // apaisado
  const anchos = [62, 190, 40, 170, 70, 110, 120]; // suma 762 ≤ W - 2M
  const totales = resumenTotales(d.filas, d.totalEur);
  const negro = rgb(0.1, 0.1, 0.1);
  let page!: PDFPage;
  let y = 0;
  let n = 0;

  const recortar = (t: string, f: PDFFont, size: number, ancho: number) => {
    let s = latin(t);
    while (s.length > 1 && f.widthOfTextAtSize(s, size) > ancho - 4) s = s.slice(0, -1);
    return s;
  };
  const fila = (celdas: string[], f: PDFFont, size: number) => {
    let x = M;
    celdas.forEach((c, i) => { page.drawText(recortar(c, f, size, anchos[i]), { x: x + 2, y, size, font: f, color: negro }); x += anchos[i]; });
    y -= size + 5;
  };
  const nuevaPagina = () => {
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
    fila([...COLUMNAS_INFORME], bold, 8);
    page.drawLine({ start: { x: M, y: y + 9 }, end: { x: W - M, y: y + 9 }, thickness: 0.5, color: negro });
    y -= 4;
  };

  nuevaPagina();
  for (const f of d.filas) {
    if (y < M + 70) nuevaPagina();
    fila(filaComoTexto(f), normal, 7.5);
  }
  if (y < M + 74) nuevaPagina();
  y -= 8;
  page.drawLine({ start: { x: M, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 0.5, color: negro });
  const linea = (t: string, f = normal) => { page.drawText(latin(t), { x: M, y, size: 10, font: f, color: negro }); y -= 14; };
  linea(`Personas: ${totales.personas} · Pagadas: ${totales.pagadas} · Pendientes: ${totales.pendientes}`);
  linea(`TOTAL ENTREGADO: ${totales.totalEur} EUR (solo pagos confirmados; las actas preparadas no cuentan).`, bold);
  if (totales.pagosSinImporteEur > 0) linea(`Pagos confirmados sin importe EUR: ${totales.pagosSinImporteEur}.`);
  if (d.modoPrueba) linea("Informe de PRUEBA: las confirmaciones son simuladas y no implican entrega de dinero.", bold);
  pdf.getPages().forEach((p, i) => p.drawText(`Página ${i + 1} de ${n}`, { x: W - M - 70, y: 14, size: 8, font: normal, color: negro }));
  return pdf.save();
}
