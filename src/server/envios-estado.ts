import { query } from "./db";
import type { EstadoEnvio } from "./envios";
import type { EstadoBrevo } from "./envios/brevo-webhook";

export type EstadoEntrega = EstadoBrevo | EstadoEnvio | "sin_envio" | "sin_contacto";
export const TEXTO_ENTREGA: Record<EstadoEntrega, string> = {
  sin_contacto: "Sin contacto", sin_envio: "Sin enviar", en_cola: "En cola",
  enviada_al_servicio: "Aceptado por el proveedor", aceptado: "Aceptado por el proveedor",
  entregada: "Entregado", entregado: "Entregado", diferido: "Entrega diferida",
  fallo: "Falló el envío", rebote_permanente: "Rebote permanente", rebote_temporal: "Rebote temporal",
  bloqueado: "Bloqueado", invalido: "Dirección inválida", spam: "Marcado como spam", error: "Error de entrega",
};

type SeguimientoCanal = { estado: EstadoEntrega; fecha: string | null };
type SeguimientoFicha = { id: number; nombre: string; cedula: string; junta: string; whatsapp: SeguimientoCanal; correo: SeguimientoCanal };

export const estadoEntregasCredenciales = () => query<SeguimientoFicha>(
  `SELECT m.id, concat(m.apellidos, ', ', m.nombres) AS nombre, m.cedula, concat(j.serie, j.numero) AS junta,
          jsonb_build_object('estado', coalesce(w.estado, CASE WHEN nullif(btrim(m.telefono_e164), '') IS NULL THEN 'sin_contacto' ELSE 'sin_envio' END),
                             'fecha', coalesce(w.enviado_en, w.creado_en)) AS whatsapp,
          jsonb_build_object('estado', coalesce(c.brevo_estado, c.estado, CASE WHEN nullif(btrim(m.correo), '') IS NULL THEN 'sin_contacto' ELSE 'sin_envio' END),
                             'fecha', coalesce(c.brevo_evento_en, c.enviado_en, c.creado_en)) AS correo
     FROM mjrv m JOIN juntas_madrid j ON j.id = m.junta_origen_id
     LEFT JOIN LATERAL (
       SELECT e.estado, e.enviado_en, e.creado_en FROM envios_credencial e
       WHERE e.mjrv_id = m.id AND e.canal = 'whatsapp' AND NOT e.simulado ORDER BY e.id DESC LIMIT 1
     ) w ON true
     LEFT JOIN LATERAL (
       SELECT e.estado, e.brevo_estado, e.brevo_evento_en, e.enviado_en, e.creado_en FROM envios_credencial e
       WHERE e.mjrv_id = m.id AND e.canal = 'correo' AND NOT e.simulado ORDER BY e.id DESC LIMIT 1
     ) c ON true
     WHERE m.activo AND NOT m.es_prueba
     ORDER BY j.serie, j.numero, m.apellidos, m.nombres, m.id`,
);
