// Informe de cierre de finanzas de Madrid (§13.9). Filas puras: las comparten el PDF y el Excel.
export type FilaInforme = {
  cedula: string; nombre: string; junta: string; estado: string; eur: string | null; usd: string | null; tipo_cambio: string | null; hora: string | null; operador: string | null; simulado: boolean;
};

export const ESTADO_INFORME: Record<string, string> = { pagada: "Pagada", acta_preparada: "Pendiente (acta preparada)", lista: "Pendiente (lista)", documentacion_incompleta: "Pendiente (documentación incompleta)" };

export const COLUMNAS_INFORME = ["Cédula", "Persona", "Junta", "Condición", "USD ref.", "T. cambio", "EUR pagados", "Momento (Madrid)", "Operador pagador"] as const;

const momento = (t: string | null) => (t ? new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "medium" }).format(new Date(t)) : "");

export function filaComoTexto(f: FilaInforme): string[] {
  return [f.cedula, f.nombre, f.junta, ESTADO_INFORME[f.estado] ?? f.estado + (f.simulado ? " (simulado)" : ""), f.usd ?? "", f.tipo_cambio ?? "", f.eur ?? "", momento(f.hora), f.operador ?? ""];
}

export const resumenTotales = (filas: FilaInforme[], totalEur: string) => ({
  personas: filas.length,
  pagadas: filas.filter((f) => f.estado === "pagada").length,
  pendientes: filas.filter((f) => f.estado !== "pagada").length,
  // Solo confirmaciones: coincide con el total del panel (nunca actas preparadas).
  totalEur,
});

export const horaDeCorte = (iso: string) => new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "medium" }).format(new Date(iso));
