import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";
import jsQR from "jsqr";
import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { RUTA_MODELO_CREDENCIAL, credencialesIndividuales, hojasA4, type DatosCredencial } from "@/server/pdf/credencial";

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

  it("sale del modelo y el QR impreso es la cédula", async () => {
    const modelo = readFileSync(path.join(process.cwd(), RUTA_MODELO_CREDENCIAL));
    const imagenes: Buffer[] = [];
    let i = 0;
    while (imagenes.length < 3) {
      const s = modelo.indexOf(Buffer.from([0xff, 0xd8, 0xff]), i);
      const e = modelo.indexOf(Buffer.from([0xff, 0xd9]), s + 2);
      imagenes.push(modelo.subarray(s, e + 2));
      i = e + 2;
    }
    const bytes = Buffer.from(await credencialesIndividuales([ficha(1), ficha(2)]));
    expect(bytes.includes(imagenes[0])).toBe(true);
    expect(bytes.includes(imagenes[1])).toBe(true);
    expect(bytes.includes(imagenes[2])).toBe(true);
    const plano = textoPlano(bytes);
    expect(plano).toContain("H01");
    expect(plano).toContain("M01");
    expect(plano).toContain("APELLIDO PRUEBA 001");
    expect(plano).toContain("0000000001");
    expect(createHash("sha256").update(imagenes[1]).digest("hex").slice(0, 16)).toBe("e98d9edce9e725b3");
    expect(createHash("sha256").update(imagenes[2]).digest("hex").slice(0, 16)).toBe("1ca7bdd2ca1e7bc3");
    const qr = await QRCode.toBuffer("0000000001", { margin: 1, width: 400, errorCorrectionLevel: "M" });
    const qrImg = await sharp(qr).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(jsQR(new Uint8ClampedArray(qrImg.data), qrImg.info.width, qrImg.info.height)?.data).toBe("0000000001");
    expect(bytes.includes("/Width 400")).toBe(true);
    let poppler = false;
    try { execFileSync("pdftoppm", ["-v"], { stdio: "ignore" }); poppler = true; } catch { /* sin poppler */ }
    if (!poppler) return;
    const dir = mkdtempSync(path.join(tmpdir(), "cred-"));
    writeFileSync(path.join(dir, "a.pdf"), bytes);
    execFileSync("pdftoppm", ["-r", "200", "-png", "-f", "1", "-l", "1", path.join(dir, "a.pdf"), path.join(dir, "a")]);
    const { data, info } = await sharp(path.join(dir, "a-1.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const leido = jsQR(new Uint8ClampedArray(data), info.width, info.height);
    expect(leido?.data).toBe("0000000001");
  });
});

function textoPlano(buf: Buffer): string {
  const trozos: Buffer[] = [];
  let i = 0;
  while (i < buf.length) {
    const s = buf.indexOf("stream", i);
    if (s < 0) break;
    const a = buf[s + 6] === 0x0a ? s + 7 : s + 8;
    const fin = buf.indexOf("endstream", a);
    try { trozos.push(inflateSync(buf.subarray(a, fin))); } catch { /* flujo ya plano */ }
    i = fin + 9;
  }
  return Buffer.concat(trozos).toString("latin1").replace(/<([0-9A-Fa-f\s]+)>/g, (_, h: string) => Buffer.from(h.replace(/\s/g, ""), "hex").toString("latin1"));
}
