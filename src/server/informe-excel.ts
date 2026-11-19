import ExcelJS from "exceljs";
import { COLUMNAS_INFORME, ESTADO_INFORME, horaDeCorte, resumenTotales } from "../domain/informe";
import type { DatosInforme } from "./pdf/informe";

const momento = (t: string | null) => (t ? new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "medium" }).format(new Date(t)) : "");

// Excel del informe de cierre: cédula como texto (conserva ceros) e importes como números.
export async function informeCierreExcel(d: DatosInforme): Promise<Buffer> {
  const t = resumenTotales(d.filas, d.totalUsd);
  const num = (v: string | null) => (v === null || v === "" ? "" : Number(v));
  const filas: (string | number)[][] = [
    ["Informe de cierre de finanzas · Madrid"],
    [`Hora de corte (Madrid): ${horaDeCorte(d.generadoEn)}`],
    ...(d.modoPrueba ? [["INFORME DE PRUEBA — SIN VALIDEZ: confirmaciones simuladas"]] : []),
    [],
    [...COLUMNAS_INFORME],
    ...d.filas.map((f) => [f.cedula, f.nombre, f.junta, ESTADO_INFORME[f.estado] ?? f.estado, num(f.usd), momento(f.hora), f.operador ?? ""]),
    [],
    ["Personas", t.personas], ["Pagadas", t.pagadas], ["Pendientes", t.pendientes],
    ["TOTAL ENTREGADO USD (solo pagos confirmados)", Number(t.totalUsd)],
  ];
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Informe");
  for (const fila of filas) hoja.addRow(fila);
  [14, 36, 8, 34, 14, 20, 24].forEach((ancho, i) => { hoja.getColumn(i + 1).width = ancho; });
  return Buffer.from(await libro.xlsx.writeBuffer());
}
