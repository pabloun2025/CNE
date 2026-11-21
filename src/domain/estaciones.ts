export type Funcion = "puerta" | "documentacion" | "finanzas" | "mando";
export const FUNCIONES: Funcion[] = ["puerta", "documentacion", "finanzas", "mando"];
export const FUNCION_NOMBRE: Record<Funcion, string> = { puerta: "Puerta", documentacion: "Documentación", finanzas: "Escáner de Finanzas", mando: "Centro de mando" };

export const PIN_VALIDO = (pin: string) => /^\d{4}$/.test(pin);
export const MAX_FALLOS_OPERADOR = 5;
export const MAX_FALLOS_ENLACE = 20;
export const MINUTOS_BLOQUEO = 15;
