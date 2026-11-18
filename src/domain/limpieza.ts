// Categorías de «Borrar datos de prueba y preparar para elección» (§14.3), en orden de borrado por dependencias.
export type CategoriaLimpieza = { tabla: string; etiqueta: string };

export const CATEGORIAS_LIMPIEZA: CategoriaLimpieza[] = [
  { tabla: "pagos_confirmados", etiqueta: "Confirmaciones de pago simuladas" },
  { tabla: "actas_pago", etiqueta: "Actas de pago de prueba" },
  { tabla: "documentos_mjrv", etiqueta: "Fotos de cédula de ensayo" },
  { tabla: "decisiones_movimiento", etiqueta: "Movimientos entre juntas" },
  { tabla: "excepciones_disponibilidad", etiqueta: "Excepciones de disponibilidad" },
  { tabla: "lecturas_puerta", etiqueta: "Lecturas de puerta" },
  { tabla: "envios_credencial", etiqueta: "Envíos de credenciales de fichas de demostración" },
  { tabla: "mjrv", etiqueta: "Fichas MJRV de demostración" },
];

export const CONSERVA: string[] = [
  "Cuentas de administración y superadministración, contraseñas y verificación en dos pasos",
  "Operadores y sus PIN, enlaces de estación",
  "Las 95 juntas y las fichas MJRV reales",
  "Parámetros de pago y configuración",
  "Fichas MJRV reales y sus envíos de credenciales",
  "Auditoría",
];

export const FRASE_PREPARAR = "PREPARAR ELECCION";
export const normalizarFrase = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
