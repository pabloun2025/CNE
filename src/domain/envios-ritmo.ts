// Cadencia de WhatsApp. El correo se procesa cada vez que la cola está disponible.
export type CanalEnvio = "whatsapp" | "correo";
export type LineaEnvioWhatsApp = 1 | 2;
export type NumerosWhatsApp = readonly [string | null, string | null];

export const FALLOS_PARA_PAUSAR = 5;

// Milisegundos entre mensajes de WhatsApp. El azar devuelve un número en [0, 1).
export function pausaWhatsAppMs(azar: () => number): number {
  return Math.round((20 + azar() * 25) * 1000);
}
