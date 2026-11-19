import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { leerArchivo } from "@/server/importar-mjrv";
import { informeCierreExcel } from "@/server/informe-excel";

async function libro(filas: Record<string, unknown>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet("MJRV");
  const claves = Object.keys(filas[0] ?? {});
  hoja.addRow(claves);
  for (const f of filas) hoja.addRow(claves.map((k) => f[k] ?? ""));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("archivos de cálculo sin SheetJS", () => {
  it("el CSV conserva los ceros de la cédula", async () => {
    const filas = await leerArchivo(Buffer.from("cedula,apellidos,nombres,cargo,serie,junta\n0000000009,A,B,Vocal,M,3\n"), "x.csv");
    expect(filas[0].cedula).toBe("0000000009");
    const conComa = await leerArchivo(Buffer.from("apellidos,cedula\n\"APELLIDO, PRUEBA\",0000000008\n"), "y.csv");
    expect(conComa[0]).toMatchObject({ apellidos: "APELLIDO, PRUEBA", cedula: "0000000008" });
  });

  it("el xlsx se lee con el encabezado y rechaza el .xls antiguo", async () => {
    const buffer = await libro([{ cedula: "0000000001", apellidos: "APELLIDO PRUEBA 001" }]);
    const filas = await leerArchivo(buffer, "lista.xlsx");
    expect(filas[0]).toMatchObject({ cedula: "0000000001", apellidos: "APELLIDO PRUEBA 001" });
    await expect(leerArchivo(buffer, "lista.xls")).rejects.toThrow(/xlsx o CSV/);
  });

  it("el informe deja la cédula como texto", async () => {
    const xlsx = await informeCierreExcel({
      generadoEn: "2026-11-19T18:00:00.000Z",
      modoPrueba: true,
      totalUsd: "100.00",
      filas: [{ cedula: "0000000001", nombre: "NOMBRE PRUEBA", junta: "H1", estado: "pagada", usd: "100.00", hora: "2026-11-19T18:00:00.000Z", operador: "Op", simulado: false }],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.read(Readable.from(xlsx));
    const hoja = wb.getWorksheet("Informe");
    const filas: unknown[][] = [];
    hoja?.eachRow({ includeEmpty: false }, (row) => { filas.push((row.values as unknown[]).slice(1)); });
    const cabecera = filas.findIndex((f) => f[0] === "Cédula");
    expect(filas[cabecera + 1][0]).toBe("0000000001");
    expect(typeof filas[cabecera + 1][0]).toBe("string");
  });
});
