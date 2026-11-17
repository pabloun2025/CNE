import { PDFDocument } from "pdf-lib";
import jsQR from "jsqr";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { credencialesIndividuales, hojasA4, type DatosCredencial } from "@/server/pdf/credencial";

const ficha = (i: number, o: Partial<DatosCredencial> = {}): DatosCredencial => ({
  cedula: String(i).padStart(10, "0"), apellidos: `APELLIDO PRUEBA ${String(i).padStart(3, "0")}`, nombres: "NOMBRE PRUEBA", cargo: "PRESIDENTE",
  rotulo: i % 2 ? "H01" : "M01", serie: i % 2 ? "H" : "M", prueba: true, ...o,
});
const pts = (mm: number) => (mm * 72) / 25.4;

describe("PDF de credenciales", () => {
  it("individual: una página de 54 × 85,6 mm por persona", async () => {
    const pdf = await PDFDocument.load(await credencialesIndividuales([ficha(1), ficha(2)]));
    expect(pdf.getPageCount()).toBe(2);
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(pts(54), 1);
    expect(height).toBeCloseTo(pts(85.6), 1);
  });

  it("A4: 1, 10 y 11 personas dan 1, 1 y 2 hojas de 210 × 297 mm", async () => {
    for (const [n, hojas] of [[1, 1], [10, 1], [11, 2]] as const) {
      const pdf = await PDFDocument.load(await hojasA4(Array.from({ length: n }, (_, i) => ficha(i + 1))));
      expect(pdf.getPageCount()).toBe(hojas);
      const { width, height } = pdf.getPage(0).getSize();
      expect(width).toBeCloseTo(pts(210), 1);
      expect(height).toBeCloseTo(pts(297), 1);
    }
  });

  it("nombres largos y caracteres fuera de WinAnsi no rompen la generación", async () => {
    const bytes = await credencialesIndividuales([ficha(1, { apellidos: "DE LA CRUZ Y FERNÁNDEZ-ESPINOSA DE LOS MONTEROS Ω", nombres: "MARÍA DEL CARMEN JOSEFA", rotulo: "M54", cargo: "VOCAL SUPLENTE TERCERO" })]);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("el QR de la hoja A4 se lee y devuelve exactamente la cédula", async () => {
    // Se rasteriza con pdftoppm si está disponible; si no, la prueba se omite sin fallar.
    let ok = false;
    try { execFileSync("pdftoppm", ["-v"], { stdio: "ignore" }); ok = true; } catch { /* sin poppler */ }
    if (!ok) return;
    const dir = mkdtempSync(path.join(tmpdir(), "cred-"));
    const datos = [ficha(1), ficha(2)];
    writeFileSync(path.join(dir, "a.pdf"), await hojasA4(datos));
    execFileSync("pdftoppm", ["-r", "200", "-png", "-singlefile", path.join(dir, "a.pdf"), path.join(dir, "a")]);
    const { data, info } = await sharp(path.join(dir, "a.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Cada hueco por separado: así se leen los dos QR de la hoja.
    const leidos: string[] = [];
    const mm = 200 / 25.4;
    for (let i = 0; i < 2; i++) {
      const x0 = Math.round((19.4 + i * 85.6) * mm), y0 = Math.round(13.5 * mm);
      const w = Math.round(85.6 * mm), h = Math.round(54 * mm);
      const recorte = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) data.copy(Buffer.from(recorte.buffer), y * w * 4, ((y0 + y) * info.width + x0) * 4, ((y0 + y) * info.width + x0 + w) * 4);
      const r = jsQR(recorte, w, h);
      if (r) leidos.push(r.data);
    }
    expect(leidos).toEqual(datos.map((d) => d.cedula));
  });
});
