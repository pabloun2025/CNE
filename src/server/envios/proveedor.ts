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

// Los envíos inmediatos de esta capa son siempre simulados. Los reales los hace la cola (cola.ts), solo con el interruptor
// de la superadmin encendido y para fichas reales.
export function elegirProveedor(canal: Canal): ProveedorEnvio {
  return proveedorSimulado(canal);
}
