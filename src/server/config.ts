import { query } from "./db";

export type Modo = "prueba" | "eleccion";

// Si la base no responde se muestra el modo prueba: es el aviso más prudente.
export async function leerModo(): Promise<Modo> {
  try {
    const filas = await query<{ modo: Modo }>("SELECT modo FROM configuracion WHERE id = 1");
    return filas[0]?.modo ?? "prueba";
  } catch {
    return "prueba";
  }
}
