export type TipoDocumento = "cedula" | "pasaporte";
export type LadoDocumento = "anverso" | "reverso" | "pasaporte";
export type EstadoDocs = { anverso: boolean; reverso: boolean; completos: boolean; pasaporte?: true };

export function esLadoDocumento(valor: unknown): valor is LadoDocumento {
  return valor === "anverso" || valor === "reverso" || valor === "pasaporte";
}

export const ESTADOS_DOCUMENTO = {
  sin_documento: "Sin fotos",
  incompleto: "Faltan fotos",
  por_validar: "Por validar",
  validado: "Validado",
  necesita_repetir: "Necesita repetir",
} as const;

export const ORIGEN_DOCUMENTOS = {
  mjrv: "Enviado por el MJRV",
  personal: "Cargado por el personal",
  mixto: "Cargado por el MJRV y el personal",
} as const;

export type EstadoSeguimientoDocumento = keyof typeof ESTADOS_DOCUMENTO;
export type OrigenFotosDocumento = keyof typeof ORIGEN_DOCUMENTOS;
