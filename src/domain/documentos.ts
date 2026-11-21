export type TipoDocumento = "cedula" | "pasaporte";
export type LadoDocumento = "anverso" | "reverso" | "pasaporte";
export type EstadoDocs = { anverso: boolean; reverso: boolean; completos: boolean; pasaporte?: true };

export function esLadoDocumento(valor: unknown): valor is LadoDocumento {
  return valor === "anverso" || valor === "reverso" || valor === "pasaporte";
}

export function normalizarNumeroPasaporte(valor: string): string | null {
  const numero = valor.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9-]{4,19}$/.test(numero) ? numero : null;
}
