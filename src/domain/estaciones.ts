export type Funcion = "puerta" | "documentacion" | "finanzas" | "mando" | "mesas" | "validacion_documental";
export const FUNCIONES_OPERADOR = ["puerta", "documentacion", "finanzas", "mando"] as const;
export const FUNCIONES: Funcion[] = [...FUNCIONES_OPERADOR, "mesas", "validacion_documental"];
export const FUNCION_NOMBRE: Record<Funcion, string> = { puerta: "Puerta", documentacion: "Documentación", finanzas: "Ingreso a Finanzas", mando: "Centro de mando", mesas: "Verificación de mesas", validacion_documental: "Validación de documentos" };

export const PIN_VALIDO = (pin: string) => /^\d{4}$/.test(pin);
export const MAX_FALLOS_OPERADOR = 5;
export const MAX_FALLOS_ENLACE = 20;
export const MINUTOS_BLOQUEO = 15;
