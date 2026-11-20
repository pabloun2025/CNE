import { ZONA_NOMBRE, type ZonaColor } from "./juntas";

// El PDF y el Excel comparten las columnas y los valores de cada ficha.
export type FilaInforme = {
  cedula: string; nombre: string; junta: string; estado: string; eur: string | null; hora: string | null; operador: string | null; simulado: boolean;
  zona: ZonaColor; cargo: string; ingresoEn: string | null; operadorIngreso: string | null; validacionEn: string | null;
};

export type DatosInforme = { generadoEn: string; modoPrueba: boolean; totalEur: string; filas: FilaInforme[] };

const ESTADO_INFORME: Record<string, string> = { pagada: "Pagada", acta_preparada: "Pendiente (acta preparada)", lista: "Pendiente (lista)", documentacion_incompleta: "Pendiente (documentación incompleta)" };
const fechaMadrid = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "medium" });
export const horaDeCorte = (iso: string) => fechaMadrid.format(new Date(iso));

type ColumnaInforme = {
  titulo: string; etiqueta?: string; anchoPdf: number; anchoExcel: number;
  valor: (f: FilaInforme) => string | number;
};

export const COLUMNAS_INFORME = {
  cedula: { titulo: "Cédula", anchoPdf: 75, anchoExcel: 15, valor: (f) => f.cedula },
  nombre: { titulo: "Persona", anchoPdf: 190, anchoExcel: 36, valor: (f) => f.nombre },
  junta: { titulo: "Junta", anchoPdf: 45, anchoExcel: 9, valor: (f) => f.junta },
  zona: { titulo: "Zona", anchoPdf: 65, anchoExcel: 12, valor: (f) => ZONA_NOMBRE[f.zona] },
  cargo: { titulo: "Cargo", etiqueta: "Cargo registrado", anchoPdf: 105, anchoExcel: 24, valor: (f) => f.cargo },
  ingreso: { titulo: "Ingreso (Madrid)", anchoPdf: 100, anchoExcel: 21, valor: (f) => f.ingresoEn ? horaDeCorte(f.ingresoEn) : "Sin ingreso" },
  operadorIngreso: { titulo: "Operador de ingreso", anchoPdf: 110, anchoExcel: 26, valor: (f) => f.operadorIngreso ?? "" },
  validacion: { titulo: "Validación (Madrid)", etiqueta: "Validación de cédula (Madrid)", anchoPdf: 100, anchoExcel: 23, valor: (f) => f.validacionEn ? horaDeCorte(f.validacionEn) : "Sin validar" },
  estado: { titulo: "Condición", etiqueta: "Estado del pago", anchoPdf: 150, anchoExcel: 37, valor: (f) => ESTADO_INFORME[f.estado] ?? f.estado },
  eur: { titulo: "EUR", etiqueta: "Importe entregado (EUR)", anchoPdf: 65, anchoExcel: 14, valor: (f) => f.eur === null ? "" : Number(f.eur) },
  hora: { titulo: "Momento (Madrid)", etiqueta: "Fecha de pago (Madrid)", anchoPdf: 110, anchoExcel: 21, valor: (f) => f.hora ? horaDeCorte(f.hora) : "" },
  operador: { titulo: "Operador pagador", anchoPdf: 120, anchoExcel: 26, valor: (f) => f.operador ?? "" },
} satisfies Record<string, ColumnaInforme>;

export type IdColumnaInforme = keyof typeof COLUMNAS_INFORME;
export const COLUMNAS_PREDETERMINADAS: readonly IdColumnaInforme[] = ["cedula", "nombre", "junta", "estado", "eur", "hora", "operador"];
export const OPCIONES_COLUMNAS = Object.keys(COLUMNAS_INFORME) as IdColumnaInforme[];

export function columnasSolicitadas(params: URLSearchParams): readonly IdColumnaInforme[] | null {
  const columnas = params.getAll("columnas");
  if (columnas.length === 0 && !params.has("seleccion")) return COLUMNAS_PREDETERMINADAS;
  if (columnas.some((id) => !Object.hasOwn(COLUMNAS_INFORME, id))) return null;
  return OPCIONES_COLUMNAS.filter((id) => columnas.includes(id));
}

export const resumenTotales = (filas: FilaInforme[], totalEur: string) => ({
  personas: filas.length,
  pagadas: filas.filter((f) => f.estado === "pagada").length,
  pendientes: filas.filter((f) => f.estado !== "pagada").length,
  pagosSinImporteEur: filas.filter((f) => f.estado === "pagada" && f.eur === null).length,
  totalEur,
});
