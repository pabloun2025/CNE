export function numeroActa(id: number | null, prueba: boolean): string {
  return `${prueba ? "PRUEBA" : "MAD"}-${id === null ? "BORRADOR" : String(id).padStart(6, "0")}`;
}
