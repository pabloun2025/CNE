// Colores de la lectura, los de la puerta de teinvito. El texto sigue siendo el de Madrid.

export type TonoLectura = "valido" | "rechazo" | "aviso";

export function tonoLectura(resultado: string): TonoLectura {
  if (resultado === "valido" || resultado === "autorizado_embajada") return "valido";
  if (resultado === "error" || resultado === "ambiguo") return "aviso";
  return "rechazo";
}

export const COLOR_LECTURA: Record<TonoLectura, string> = {
  valido: "bg-[#1f7a4d] text-white",
  rechazo: "bg-[#c8102e] text-white",
  aviso: "bg-[#3e4f68] text-white",
};
