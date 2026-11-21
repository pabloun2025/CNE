// Categorías de «Borrar datos de prueba y preparar para elección» (§14.3), en orden de borrado por dependencias.
export type CategoriaLimpieza = { tabla: string; etiqueta: string };

export const CATEGORIAS_LIMPIEZA: CategoriaLimpieza[] = [
  { tabla: "pagos_confirmados", etiqueta: "Confirmaciones de pago simuladas" },
  { tabla: "actas_pago", etiqueta: "Actas de pago de prueba" },
  { tabla: "documentos_mjrv", etiqueta: "Fotos de cédula de ensayo" },
  { tabla: "fichas_abiertas_finanzas", etiqueta: "Fichas abiertas en finanzas" },
  { tabla: "escaneos_finanzas", etiqueta: "Escaneos de finanzas" },
  { tabla: "cedulas_validadas", etiqueta: "Validaciones de cédula de ensayo" },
  { tabla: "pendientes_impresion", etiqueta: "Actas pendientes de imprimir" },
  { tabla: "firmas_recibo", etiqueta: "Recibos firmados en pantalla" },
  { tabla: "asignaciones_cargo", etiqueta: "Cargos asumidos" },
  { tabla: "decisiones_movimiento", etiqueta: "Movimientos entre juntas" },
  { tabla: "excepciones_disponibilidad", etiqueta: "Excepciones de disponibilidad" },
  { tabla: "lecturas_puerta", etiqueta: "Lecturas de puerta" },
  { tabla: "envios_credencial", etiqueta: "Envíos de credenciales de fichas de demostración" },
  { tabla: "mjrv", etiqueta: "Fichas MJRV de demostración" },
];

export const CONSERVA: string[] = [
  "Cuentas de administración y superadministración y sus contraseñas",
  "Operadores y sus PIN, enlaces de estación",
  "Las 95 juntas y las fichas MJRV reales",
  "Parámetros de pago y configuración",
  "Fichas MJRV reales y sus envíos de credenciales",
  "Auditoría",
];

export const FRASE_PREPARAR = "PREPARAR ELECCION";
export const normalizarFrase = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toUpperCase();

export const CONSERVA_REINICIO: string[] = [
  "Las 95 juntas de Madrid y su distribución por zonas",
  "Cuentas, contraseñas y permisos de administración y superadministración",
  "Operadores, PIN y enlaces de estación",
  "Configuración, claves, remitente y parámetros de pago (los envíos reales quedan apagados)",
  "Auditoría y registros de anteriores reinicios",
];
