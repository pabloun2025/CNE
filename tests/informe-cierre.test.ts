import { describe, expect, it } from "vitest";
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import * as XLSX from "xlsx";
import { columnasSolicitadas } from "@/domain/informe";
import { informeCierreExcel } from "@/server/informe-excel";
import { informeCierrePdf } from "@/server/pdf/informe";

const datos = {
  generadoEn: "2026-11-29T07:35:00.000Z",
  modoPrueba: true,
  totalEur: "55.25",
  filas: [{
    cedula: "0000000001", nombre: "APELLIDO PRUEBA, NOMBRE PRUEBA", junta: "H25", zona: "azul" as const,
    cargo: "Secretario", ingresoEn: "2026-11-29T07:05:00.000Z", operadorIngreso: "Puerta Prueba", validacionEn: "2026-11-29T07:15:00.000Z",
    estado: "pagada", eur: "55.25", hora: "2026-11-29T07:30:00.000Z", operador: "Operador Prueba", simulado: true,
  }, {
    cedula: "0000000002", nombre: "SIN PAGO PRUEBA", junta: "H25", zona: "azul" as const,
    cargo: "Vocal", ingresoEn: null, operadorIngreso: null, validacionEn: null,
    estado: "acta_preparada", eur: null, hora: null, operador: null, simulado: false,
  }],
};

describe("informe de cierre configurable", () => {
  it("conserva los enlaces antiguos y distingue una solicitud sin columnas o con columnas desconocidas", () => {
    expect(columnasSolicitadas(new URLSearchParams("formato=xlsx"))).toEqual(["cedula", "nombre", "junta", "estado", "eur", "hora", "operador"]);
    expect(columnasSolicitadas(new URLSearchParams("seleccion=1"))).toEqual([]);
    expect(columnasSolicitadas(new URLSearchParams("columnas=zona&columnas=foto"))).toBeNull();
    expect(columnasSolicitadas(new URLSearchParams("columnas=eur&columnas=zona&columnas=eur"))).toEqual(["zona", "eur"]);
  });

  it("Excel muestra solamente las columnas elegidas y conserva el total en EUR", () => {
    const libro = XLSX.read(informeCierreExcel(datos, ["zona", "cargo", "ingreso", "validacion", "eur"]));
    const filas = XLSX.utils.sheet_to_json<(string | number)[]>(libro.Sheets.Informe, { header: 1, blankrows: false });
    const cabecera = filas.findIndex((f) => f[0] === "Zona");
    expect(filas[cabecera]).toEqual(["Zona", "Cargo", "Ingreso (Madrid)", "Validación (Madrid)", "EUR"]);
    expect(filas[cabecera + 1]).toEqual(["Azul", "Secretario", "29/11/26, 8:05:00", "29/11/26, 8:15:00", 55.25]);
    expect(filas[cabecera + 2]).toEqual(["Azul", "Vocal", "Sin ingreso", "Sin validar", ""]);
    expect(filas.flat()).not.toContain("0000000001");
    expect(filas).toContainEqual(["TOTAL ENTREGADO EUR (solo pagos confirmados)", 55.25]);
  });

  it("PDF omite identidad y operador si el usuario solo selecciona junta y cargo", async () => {
    const pdf = await PDFDocument.load(await informeCierrePdf(datos, ["junta", "cargo"]));
    const contenido = pdf.getPages().flatMap((p) => {
      const streams = p.node.Contents();
      return streams instanceof PDFArray ? streams.asArray() : [streams];
    }).map((ref) => {
      const stream = pdf.context.lookup(ref);
      if (!(stream instanceof PDFRawStream)) throw new Error("Falta el contenido de la página");
      return Buffer.from(decodePDFRawStream(stream).decode()).toString();
    }).join("\n");
    const texto = (fragmento: string) => Buffer.from(fragmento, "latin1").toString("hex").toUpperCase();
    expect(contenido).toContain(texto("Cargo"));
    expect(contenido).toContain(texto("Secretario"));
    expect(contenido).toContain(texto("TOTAL ENTREGADO: 55.25 EUR"));
    expect(contenido).not.toContain(texto("0000000001"));
    expect(contenido).not.toContain(texto("Operador Prueba"));
  });
});
