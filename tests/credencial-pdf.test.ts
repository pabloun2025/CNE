import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";
import jsQR from "jsqr";
import { PDFArray, PDFDocument, PDFRawStream, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { RUTA_MODELO_CREDENCIAL, credencialesIndividuales, hojasA4, type DatosCredencial } from "@/server/pdf/credencial";

const ficha = (i: number, o: Partial<DatosCredencial> = {}): DatosCredencial => ({
  cedula: String(i).padStart(10, "0"), apellidos: `APELLIDO PRUEBA ${String(i).padStart(3, "0")}`, nombres: "NOMBRE PRUEBA", cargo: "PRESIDENTE",
  rotulo: i % 2 ? "H01" : "M01", serie: i % 2 ? "H" : "M", zona: i % 2 ? "amarillo" : "azul", prueba: true, ...o,
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

  it("A4: 1, 11 y 12 personas dan 1, 1 y 2 hojas de 297 × 210 mm", async () => {
    for (const [n, hojas] of [[1, 1], [11, 1], [12, 2]] as const) {
      const pdf = await PDFDocument.load(await hojasA4(Array.from({ length: n }, (_, i) => ficha(i + 1))));
      expect(pdf.getPageCount()).toBe(hojas);
      const { width, height } = pdf.getPage(0).getSize();
      expect(width).toBeCloseTo(pts(297), 1);
      expect(height).toBeCloseTo(pts(210), 1);
    }
  });

  it("conserva el tamaño personalizado al descargar una persona", async () => {
    const pdf = await PDFDocument.load(await credencialesIndividuales([ficha(1)], { ancho: 72.25, alto: 63 }));
    const { width, height } = pdf.getPage(0).getSize();
    expect(width).toBeCloseTo(pts(72.25));
    expect(height).toBeCloseTo(pts(63));
  });

  it("aprovecha 14 posiciones por plancha con credenciales de 55 × 70 mm", async () => {
    const pdf = await PDFDocument.load(await hojasA4(Array.from({ length: 15 }, (_, i) => ficha(i + 1)), { ancho: 55, alto: 70 }));
    expect(pdf.getPageCount()).toBe(2);
    expect(operadoresPagina(pdf.getPage(0)).match(/\bd\n/g)).toHaveLength(14);
  });

  it("nombres largos y caracteres fuera de WinAnsi no rompen la generación", async () => {
    const bytes = await credencialesIndividuales([ficha(1, { apellidos: "DE LA CRUZ Y FERNÁNDEZ-ESPINOSA DE LOS MONTEROS Ω", nombres: "MARÍA DEL CARMEN JOSEFA", rotulo: "M54", cargo: "VOCAL SUPLENTE TERCERO" })]);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it.each([
    ["amarillo", "Amarillo", [242, 194, 0]],
    ["azul", "Azul", [31, 95, 168]],
    ["rojo", "Rojo", [198, 40, 40]],
    ["celeste", "Celeste", [79, 195, 247]],
    ["verde", "Verde", [46, 125, 50]],
    ["rosado", "Rosado", [244, 143, 177]],
  ] as const)("imprime el nombre y el rótulo del color de la zona %s", async (zona, nombre, color) => {
    const bytes = await credencialesIndividuales([ficha(1, { zona })]);
    const plano = await textoPlano(bytes);
    expect(plano).toContain(`Zona: ${nombre}`);
    expect(plano).toContain(`${color.map((canal) => canal / 255).join(" ")} rg`);
  });

  it("imprime el cargo 2do. VOCAL SUPLENTE completo y con sus minúsculas", async () => {
    const bytes = await credencialesIndividuales([ficha(2, { cargo: "2do. VOCAL SUPLENTE" })]);
    expect(await textoPlano(bytes)).toContain("2do. VOCAL SUPLENTE");
  });

  it("imprime el rótulo con las mayúsculas y los espacios del Excel", async () => {
    const bytes = await credencialesIndividuales([ficha(2, { rotulo: "jRv  07" })]);
    expect(await textoPlano(bytes)).toContain("jRv  07");
  });

  it("un carácter de control invisible en el rótulo no impide imprimir el lote", async () => {
    const bytes = await credencialesIndividuales([ficha(1, { rotulo: "H\u008501" }), ficha(2)]);
    const texto = await textoPlano(bytes);
    expect(texto).toContain("H 01");
    expect(texto).toContain("M01");
  });

  it("la última hoja solo tiene guías de corte para las credenciales que contiene", async () => {
    const pdf = await PDFDocument.load(await hojasA4(Array.from({ length: 12 }, (_, i) => ficha(i + 1))));
    expect(operadoresPagina(pdf.getPage(1)).match(/\bd\n/g)).toHaveLength(1);
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
    const plano = await textoPlano(bytes);
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
    execFileSync("pdftoppm", ["-r", "200", "-png", path.join(dir, "a.pdf"), path.join(dir, "a")]);
    for (const [pagina, color] of [[1, [242, 194, 0]], [2, [31, 95, 168]]] as const) {
      const { data, info } = await sharp(path.join(dir, `a-${pagina}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data).toBe(ficha(pagina).cedula);
      // La silueta queda a la derecha del rótulo y por encima del QR.
      let pixelesDeZona = 0;
      for (let y = Math.round(0.44 * info.height); y < 0.73 * info.height; y++) {
        for (let x = Math.round(0.71 * info.width); x < 0.95 * info.width; x++) {
          const indice = (y * info.width + x) * 4;
          if (color.every((canal, i) => data[indice + i] === canal)) pixelesDeZona++;
        }
      }
      expect(pixelesDeZona).toBeGreaterThan(500);
    }
  });
});

it("la imagen de producción incluye el modelo de la credencial", () => {
  const docker = readFileSync("Dockerfile", "utf8");
  const ignore = readFileSync(".dockerignore", "utf8");
  expect(existsSync(RUTA_MODELO_CREDENCIAL)).toBe(true);
  expect(docker).toContain("insumos/originales/MODELO_DE_CREDENCIALES_DE_MJRV.pdf");
  expect(ignore.split("\n").some((l) => l.trim() === "insumos")).toBe(false);
  expect(ignore).toContain("!insumos/originales/MODELO_DE_CREDENCIALES_DE_MJRV.pdf");
});

function operadoresPagina(pagina: PDFPage): string {
  const contenido = pagina.node.Contents();
  const flujos = contenido instanceof PDFArray
    ? contenido.asArray().map((_, i) => contenido.lookup(i, PDFRawStream))
    : contenido instanceof PDFRawStream ? [contenido] : [];
  return flujos.map((flujo) => inflateSync(flujo.getContents()).toString("latin1")).join("\n");
}

async function textoPlano(bytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPages().map(operadoresPagina).join("\n").replace(/<([0-9A-Fa-f\s]+)>/g, (_, h: string) => Buffer.from(h.replace(/\s/g, ""), "hex").toString("latin1"));
}
