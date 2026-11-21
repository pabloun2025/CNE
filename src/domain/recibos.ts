export const CUPO_RECIBOS = 285;
export const RECIBOS_TRAMO_INICIAL = 190;
export const RECIBOS_IMPORTE_USD = "70.00";
export const RECIBOS_TIPO_CAMBIO = "1.190";

export function importeReciboEUR(ordinal: number): string {
  return ordinal <= RECIBOS_TRAMO_INICIAL ? "58.82" : "58.83";
}

export function numeroActa(id: number | null, prueba: boolean, ordinal?: number | null): string {
  const prefijo = prueba ? "PRUEBA" : "MAD";
  if (ordinal != null) return `${prefijo}-2026-${String(ordinal).padStart(3, "0")}`;
  return `${prefijo}-${id === null ? "BORRADOR" : String(id).padStart(6, "0")}`;
}
