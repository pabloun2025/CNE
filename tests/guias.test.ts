import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, type PDFPage } from "pdf-lib";
import jsQR from "jsqr";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { crearEnlace, listarEnlaces, revocarEnlace } from "@/server/estaciones";
import { contextoGuias, descargarGuia, leerGuia } from "@/server/guias";
import { GUIAS, guiaPdf, LADO_QR_MM, SIN_ENLACE, todasLasGuiasPdf, type ContextoGuias } from "@/server/pdf/guias";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const base = "https://madrid.prueba.invalid";
const token = (f: string) => `TOKEN-PRUEBA-${f}-abcdefghijklmnopqrstuvwxyz0123456789`;
const completo: ContextoGuias = { base, enlaces: Object.fromEntries(["puerta", "documentacion", "finanzas", "mando"].map((f) => [f, { etiqueta: `${f} prueba`, token: token(f) }])) };
const vacio: ContextoGuias = { base, enlaces: {} };
const cons: Sesion = { sesionId: "x", usuarioId: 1, correo: "a@x.y", nombre: "Admin Prueba", tipo: "madrid_admin", rol: "consul", debeCambiar: false };

function texto(page: PDFPage, pdf: PDFDocument): string {
  const contenido = page.node.Contents();
  const flujos = contenido instanceof PDFArray ? contenido.asArray() : [contenido];
  const dec = new TextDecoder("windows-1252");
  return flujos.flatMap((ref) => {
    const flujo = pdf.context.lookup(ref);
    if (!(flujo instanceof PDFRawStream)) throw new Error("Falta el contenido");
    return Array.from(Buffer.from(decodePDFRawStream(flujo).decode()).toString("ascii").matchAll(/<([\da-f]+)>\s*Tj/gi), ([, hex]) => dec.decode(Buffer.from(hex, "hex")));
  }).join(" ");
}
// Lee todos los QR de la página y el lado mayor con el que se dibujan, en milímetros.
async function qrs(page: PDFPage, pdf: PDFDocument): Promise<{ datos: string[]; ladosMm: number[] }> {
  const imagenes = page.node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
  const datos: string[] = [];
  for (const ref of imagenes?.values() ?? []) {
    const im = pdf.context.lookup(ref);
    if (!(im instanceof PDFRawStream)) continue;
    const w = im.dict.lookup(PDFName.of("Width"), PDFNumber).asNumber(), h = im.dict.lookup(PDFName.of("Height"), PDFNumber).asNumber();
    const px = await sharp(decodePDFRawStream(im).decode(), { raw: { width: w, height: h, channels: 3 } }).ensureAlpha().raw().toBuffer();
    const r = jsQR(new Uint8ClampedArray(px), w, h);
    if (r) datos.push(r.data);
  }
  const contenido = page.node.Contents();
  const flujos = contenido instanceof PDFArray ? contenido.asArray() : [contenido];
  const crudo = flujos.map((ref) => Buffer.from(decodePDFRawStream(pdf.context.lookup(ref) as PDFRawStream).decode()).toString("ascii")).join("\n");
  const ladosMm = Array.from(crudo.matchAll(/([\d.]+) 0 0 ([\d.]+) [\d.-]+ [\d.-]+ cm(?=(?:\s+[^\n]+ cm)*\s+\/Image-\d+ Do)/g))
    .filter(([, w, h]) => w === h && Number(w) > 1).map(([, w]) => Number(w) / 2.83465);
  return { datos, ladosMm };
}
const abrir = async (n: number, c: ContextoGuias) => { const pdf = await PDFDocument.load(await guiaPdf(n, c)); return { pdf, page: pdf.getPage(0) }; };

const PUESTO: Record<number, string[]> = { 2: ["finanzas"], 3: ["puerta"], 4: ["documentacion"], 5: ["mando"], 6: ["puerta", "documentacion", "finanzas", "mando"] };
const URLS_ADMIN: Record<number, string[]> = {
  1: ["/admin/mjrv", "/admin/credenciales"], 2: ["/admin/finanzas/documentos", "/admin/finanzas/pagar", "/admin/finanzas/caja"], 4: ["/d"], 7: ["/admin/finanzas", "/admin/informes"],
};

describe("guías rápidas generadas por el sistema", () => {
  it("son siete hojas A4 de una página y un PDF con todas", async () => {
    expect(GUIAS).toHaveLength(7);
    for (const g of GUIAS) {
      const { pdf, page } = await abrir(g.n, completo);
      expect(pdf.getPageCount()).toBe(1);
      expect(page.getWidth()).toBeCloseTo(595.28, 1);
      expect(texto(page, pdf)).toContain(g.titulo);
      expect(texto(page, pdf)).toContain("Jornada electoral · 29 de noviembre de 2026");
    }
    expect((await PDFDocument.load(await todasLasGuiasPdf(completo))).getPageCount()).toBe(7);
  });

  it("con enlace activo, cada guía lleva QR legibles de al menos 35 mm hacia /e/<token> y las rutas indicadas", async () => {
    expect(LADO_QR_MM).toBeGreaterThanOrEqual(35);
    for (const g of GUIAS) {
      const { pdf, page } = await abrir(g.n, completo);
      const { datos, ladosMm } = await qrs(page, pdf);
      const esperados = [...(PUESTO[g.n] ?? []).map((f) => `${base}/e/${token(f)}`), ...(URLS_ADMIN[g.n] ?? []).map((r) => `${base}${r}`)];
      expect(datos.sort(), `guía ${g.n}`).toEqual(esperados.sort());
      expect(ladosMm).toHaveLength(esperados.length);
      expect(Math.max(...ladosMm), `guía ${g.n}`).toBeGreaterThanOrEqual(35);
      const t = texto(page, pdf);
      if (PUESTO[g.n]) expect(t).toContain("Si se revoca el enlace, vuelva a descargar la guía.");
      if (g.n === 5 || g.n === 6) expect(t).toContain("Solo Centro de mando pide nombre y PIN.");
      else expect(t).not.toContain("nombre y PIN");
      expect(Math.min(...ladosMm), `guía ${g.n}`).toBeGreaterThanOrEqual(35);
      expect(texto(page, pdf)).not.toContain(SIN_ENLACE);
    }
  });

  it("sin enlace activo avisa en lugar del QR del puesto", async () => {
    for (const n of [2, 3, 4, 5, 6]) {
      const { pdf, page } = await abrir(n, vacio);
      const { datos } = await qrs(page, pdf);
      expect(datos.filter((d) => d.includes("/e/"))).toEqual([]);
      const t = texto(page, pdf);
      expect(t.split(SIN_ENLACE.split(":")[0]).length - 1, `guía ${n}`).toBe(PUESTO[n].length);
      expect(t).toContain("pida un enlace a Superadministración.");
      expect(t).not.toContain("Si se revoca el enlace");
    }
  });

  it("la guía de Finanzas indica el atajo tras revisión itinerante y el pase de papel a Caja", async () => {
    const { pdf, page } = await abrir(2, completo);
    const t = texto(page, pdf);
    expect(t).toContain("equipo itinerante");
    expect(t).toContain("pase directo a Impresión");
    expect(t).toContain("Papel listo · Enviar a Caja");
  });

  it("la guía 1 conserva solo la regla de letras de la junta", async () => {
    const { pdf, page } = await abrir(1, completo);
    const t = texto(page, pdf);
    expect(t).toContain("Junta: M = masculino · F = femenino");
    expect(t).not.toMatch(/Serie del padr|H en padr|letras anteriores/);
  });
});

describe("enlaces de estación y descarga", () => {
  beforeAll(async () => {
    process.env.HOST_MADRID = "madrid.prueba.invalid";
    await reiniciarBase();
    for (const f of ["puerta", "finanzas"] as const) await crearEnlace(cons, f, `${f} prueba`);
    await consultarDueno("DELETE FROM cne.auditoria WHERE accion = 'guia_descargada'");
  });
  afterAll(closePools);

  it("toma el enlace activo descifrado y deja sin QR el que se revoca", async () => {
    const ctx = await contextoGuias();
    expect(Object.keys(ctx.enlaces).sort()).toEqual(["finanzas", "puerta"]);
    const { pdf, page } = await abrir(3, ctx);
    expect((await qrs(page, pdf)).datos).toEqual([`${base}/e/${ctx.enlaces.puerta!.token}`]);
    const activo = (await listarEnlaces()).find((e) => e.funcion === "puerta" && e.activo)!;
    await revocarEnlace(cons, activo.id);
    expect((await contextoGuias()).enlaces.puerta).toBeUndefined();
  });

  it("audita la descarga sin guardar el enlace", async () => {
    const r = await descargarGuia(cons, 2);
    expect(r.nombre).toBe("02-flujo-finanzas.pdf");
    expect((await descargarGuia(cons, "todas")).nombre).toBe("guias-rapidas-cne-madrid.pdf");
    const zip = await descargarGuia(cons, "zip");
    expect(zip.tipo).toBe("application/zip");
    const dir = mkdtempSync(join(tmpdir(), "cne-guias-"));
    try {
      const ruta = join(dir, zip.nombre);
      writeFileSync(ruta, Buffer.from(await new Response(zip.cuerpo).arrayBuffer()));
      const nombres = execFileSync("unzip", ["-Z1", ruta], { encoding: "utf8" }).trim().split("\n");
      expect(nombres).toEqual(GUIAS.map((g) => `${g.archivo}.pdf`));
      for (const nombre of nombres) {
        const pdf = await PDFDocument.load(execFileSync("unzip", ["-p", ruta, nombre]));
        expect(pdf.getPageCount()).toBe(1);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    const filas = await consultarDueno<{ datos: Record<string, unknown> }>("SELECT datos FROM cne.auditoria WHERE accion = 'guia_descargada' ORDER BY id");
    expect(filas.map((f) => f.datos.guia)).toEqual([2, "todas", "zip"]);
    expect(JSON.stringify(filas)).not.toMatch(/token|\/e\//i);
  });

  it("solo acepta guías 1 a 7, «todas» o «zip»", () => {
    expect([leerGuia("1"), leerGuia("7"), leerGuia("todas"), leerGuia("zip")]).toEqual([1, 7, "todas", "zip"]);
    expect([leerGuia("0"), leerGuia("8"), leerGuia("10"), leerGuia("x")]).toEqual([null, null, null, null]);
  });
});
