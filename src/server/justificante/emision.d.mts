import type { KeyObject } from "node:crypto";
export function canjearEmision(token: unknown, opciones: {
  clavesPuestos: Record<string, string | KeyObject>;
  clavePrivada: KeyObject;
  now?: () => number;
  vigenciaMs?: number;
}): { cedula: string; nombre: string; puesto: string; tipo: "con" | "sin"; emitidoMs: number; id: string };
