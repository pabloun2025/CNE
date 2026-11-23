import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodePDFRawStream, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/admin/(panel)/credenciales/pdf/route";
import { MM } from "@/domain/credencial-layout";

const { query, sesionApi } = vi.hoisted(() => ({ query: vi.fn(), sesionApi: vi.fn() }));
vi.mock("@/server/db", () => ({ query }));
vi.mock("@/server/guard", () => ({ sesionApi, rechazoAdminApi: () => new Response(null, { status: 403 }) }));

const persona = (id: number) => ({ id, cedula: String(id).padStart(10, "0"), nombres: "NOMBRE PRUEBA", apellidos: "APELLIDO PRUEBA", cargo_original: "VOCAL", rotulo_credencial: "H01", serie: "H", numero: 1, zona_color: "amarillo", es_prueba: true, sin_preparar: true });

const descargar = (formato: string, ids: string[]) => POST(new Request("http://localhost/admin/credenciales/pdf", {
  method: "POST", body: new URLSearchParams([["formato", formato], ...ids.map((id) => ["ids", id])]),
}));

beforeEach(() => {
  sesionApi.mockReset().mockResolvedValue({ rol: "consul" });
  query.mockReset().mockImplementation(async (sql: string, params: unknown[][]) => {
    if (sql.includes("FROM mjrv m")) return [persona(1), persona(2), { ...persona(3), serie: "M", numero: 7, rotulo_credencial: "M07", zona_color: "rojo" }].filter((p) => params[0].includes(p.id));
    if (sql.includes("SELECT modo")) return [{ modo: "prueba" }];
    if (sql.includes("credencial_ancho_mm")) return [{ ancho: "72.25", alto: "63" }];
    return [];
  });
});

describe("descarga de la selección de credenciales", () => {
  it("entrega un PDF de las medidas guardadas cuando se selecciona una ficha", async () => {
    const resp = await descargar("individual", ["1"]);
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toBe("application/pdf");
    expect(resp.headers.get("content-disposition")).toBe('attachment; filename="H1-0000000001.pdf"');
    const pdf = await PDFDocument.load(await resp.arrayBuffer());
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(72.25 * MM);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(63 * MM);
  });

  it("descarga un PDF distinto para cada ficha del ZIP, aun cuando compartan rótulo", async () => {
    const resp = await descargar("individual", ["1", "2"]);
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toBe("application/zip");
    const carpeta = mkdtempSync(join(tmpdir(), "cne-cred-zip-"));
    try {
      const archivo = join(carpeta, "credenciales.zip");
      writeFileSync(archivo, Buffer.from(await resp.arrayBuffer()));
      const nombres = execFileSync("unzip", ["-Z1", archivo], { encoding: "utf8" }).trim().split("\n");
      expect(nombres).toEqual(["H1-0000000001.pdf", "H1-0000000002.pdf"]);
      for (const nombre of nombres) {
        const pdf = await PDFDocument.load(execFileSync("unzip", ["-p", archivo, nombre]));
        expect(pdf.getPageCount()).toBe(1);
        expect(pdf.getPage(0).getWidth()).toBeCloseTo(72.25 * MM);
      }
      expect(query).toHaveBeenCalledWith(expect.stringContaining("UPDATE mjrv"), [[1, 2]]);
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it("abre las planchas A4 en el visor como acción de impresión", async () => {
    const resp = await descargar("a4", ["1", "3"]);
    expect(resp.headers.get("content-disposition")).toBe('inline; filename="credenciales-a4.pdf"');
    const pdf = await PDFDocument.load(await resp.arrayBuffer());
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(210 * MM);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(297 * MM);
    const tarjetas = pdf.context.enumerateIndirectObjects().flatMap(([, o]) =>
      o instanceof PDFRawStream && o.dict.get(PDFName.of("Subtype"))?.toString() === "/Form"
        ? [Buffer.from(decodePDFRawStream(o).decode()).toString("ascii")] : []);
    expect(tarjetas.join("\n")).toContain("<4D31> Tj");
    expect(tarjetas.join("\n")).toContain("<4637> Tj");
    expect(tarjetas.join("\n")).not.toMatch(/<(483031|4D3037)> Tj/);
  });

  it("detecta que la selección cambió y evita una plancha parcial", async () => {
    expect((await descargar("a4", ["1", "4"])).status).toBe(409);
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("UPDATE mjrv"), expect.anything());
  });

  it("rechaza listas vacías o con identificadores inválidos", async () => {
    expect((await descargar("individual", [])).status).toBe(400);
    expect((await descargar("individual", ["1", "2e0"])).status).toBe(400);
  });

  it("comprueba el permiso antes de consultar las fichas", async () => {
    sesionApi.mockResolvedValue(null);
    expect((await descargar("a4", ["1"])).status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });
});
