// Cadencia de WhatsApp. El correo se procesa cada vez que la cola está disponible.
export type CanalEnvio = "whatsapp" | "correo";
export type LineaEnvioWhatsApp = 1 | 2;
export type NumerosWhatsApp = readonly [string | null, string | null];

export const PAUSA_MANUAL_WHATSAPP = "Pausado desde Credenciales.";

export const FALLOS_PARA_PAUSAR = 5;
export const PAUSA_WHATSAPP_MIN_S = 90;
export const PAUSA_WHATSAPP_MAX_S = 150;

// Milisegundos entre mensajes de WhatsApp. El azar devuelve un número en [0, 1).
export function pausaWhatsAppMs(azar: () => number): number {
  return Math.round((PAUSA_WHATSAPP_MIN_S + azar() * (PAUSA_WHATSAPP_MAX_S - PAUSA_WHATSAPP_MIN_S)) * 1000);
}
