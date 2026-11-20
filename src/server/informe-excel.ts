import * as XLSX from "xlsx";
import { COLUMNAS_INFORME, COLUMNAS_PREDETERMINADAS, horaDeCorte, resumenTotales, type DatosInforme, type IdColumnaInforme } from "../domain/informe";

// Excel del informe de cierre: cédula como texto (conserva ceros) e importes como números.
export function informeCierreExcel(d: DatosInforme, seleccion: readonly IdColumnaInforme[] = COLUMNAS_PREDETERMINADAS): Buffer {
  const t = resumenTotales(d.filas, d.totalEur);
  const columnas = seleccion.map((id) => COLUMNAS_INFORME[id]);
  const filas: (string | number)[][] = [
    ["Informe de cierre de finanzas · Madrid"],
    [`Hora de corte (Madrid): ${horaDeCorte(d.generadoEn)}`],
    ...(d.modoPrueba ? [["INFORME DE PRUEBA — SIN VALIDEZ: confirmaciones simuladas"]] : []),
    ...(columnas.length ? [[], columnas.map((c) => c.titulo), ...d.filas.map((f) => columnas.map((c) => c.valor(f)))] : []),
    [],
    ["Personas", t.personas], ["Pagadas", t.pagadas], ["Pendientes", t.pendientes],
    ["TOTAL ENTREGADO EUR (solo pagos confirmados)", Number(t.totalEur)],
    ...(t.pagosSinImporteEur > 0 ? [["Pagos confirmados sin importe EUR", t.pagosSinImporteEur]] : []),
  ];
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  hoja["!cols"] = [{ wch: 49 }, { wch: Math.max(12, columnas[1]?.anchoExcel ?? 0) }, ...columnas.slice(2).map((c) => ({ wch: c.anchoExcel }))];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Informe");
  return XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
