// Ritmo y límites del envío real (09 §3.7, Q-D3 opción A). Funciones puras: el reloj y el azar se inyectan.
export type CanalEnvio = "whatsapp" | "correo";

// Pausa entre envíos, al azar dentro del rango (WhatsApp como consulares y teinvito; correo más corto).
export const PAUSA_SEGUNDOS: Record<CanalEnvio, { min: number; max: number }> = { whatsapp: { min: 20, max: 45 }, correo: { min: 2, max: 5 } };
// Tope diario por canal (WhatsApp: el de consulares; correo: la cuenta de Brevo se comparte con consulares).
export const TOPE_DIARIO: Record<CanalEnvio, number> = { whatsapp: 150, correo: 200 };
export const FALLOS_PARA_PAUSAR = 5;
// Horario de envío: de 9:00 a 21:00 (hora de Madrid), todos los días.
export const HORA_DESDE = 9;
export const HORA_HASTA = 21;
export const ZONA_HORARIA = "Europe/Madrid";

export function horaEnMadrid(ahora: Date): number {
  const h = new Intl.DateTimeFormat("es-ES", { timeZone: ZONA_HORARIA, hour: "numeric", hourCycle: "h23" }).formatToParts(ahora).find((p) => p.type === "hour")?.value;
  return Number(h);
}

export const dentroDeHorario = (ahora: Date): boolean => {
  const h = horaEnMadrid(ahora);
  return h >= HORA_DESDE && h < HORA_HASTA;
};

// Milisegundos de espera tras un envío. `azar` devuelve un número en [0, 1).
export function pausaAlAzarMs(canal: CanalEnvio, azar: () => number): number {
  const { min, max } = PAUSA_SEGUNDOS[canal];
  return Math.round((min + azar() * (max - min)) * 1000);
}
