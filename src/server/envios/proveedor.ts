import { loadEnv } from "../env";

export type Canal = "whatsapp" | "correo";
export type MensajeCredencial = { destino: string; nombre: string; rotulo: string; asunto: string; texto: string; nombreArchivo: string; pdf: Uint8Array };
export type RespuestaEnvio = { idExterno: string; simulado: boolean };
export interface ProveedorEnvio {
  canal: Canal;
  enviar(m: MensajeCredencial): Promise<RespuestaEnvio>;
}

// Proveedor simulado: no sale nada de la aplicación. Devuelve un identificador evidentemente falso.
export function proveedorSimulado(canal: Canal): ProveedorEnvio {
  return { canal, enviar: async () => ({ idExterno: `SIMULADO-${canal}-${Date.now().toString(36)}`, simulado: true }) };
}

const VARIABLE: Record<Canal, string> = { whatsapp: "WHATSAPP_REAL_SEND", correo: "EMAIL_REAL_SEND" };

// Con la variable *_REAL_SEND ausente (o distinta de «true») el envío es simulado. Con «true» haría falta conectar
// Evolution API (WhatsApp) o Brevo (correo) aquí; mientras no esté conectado se rechaza en vez de simular a escondidas.
export function elegirProveedor(canal: Canal): ProveedorEnvio {
  loadEnv();
  if (process.env[VARIABLE[canal]] === "true") {
    throw new Error(`${VARIABLE[canal]}=true pero el proveedor real aún no está conectado en esta versión. No se envió nada.`);
  }
  return proveedorSimulado(canal);
}
