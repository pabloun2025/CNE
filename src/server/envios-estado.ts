import type { LineaEnvioWhatsApp } from "../domain/envios-ritmo";
import { query } from "./db";
import { juntaPublicaSql } from "./junta-sql";
import type { EstadoEnvio } from "./envios";
import type { EstadoBrevo } from "./envios/brevo-webhook";

export type EstadoEntrega = EstadoBrevo | EstadoEnvio | "sin_envio" | "sin_contacto" | "reservado" | "incierto";
export const TEXTO_ENTREGA: Record<EstadoEntrega, string> = {
  sin_contacto: "Sin contacto", sin_envio: "Sin enviar", en_cola: "En cola",
  reservado: "Reservado para envío", incierto: "Resultado incierto",
  enviada_al_servicio: "Aceptado por el proveedor", aceptado: "Aceptado por el proveedor",
  entregada: "Entregado", entregado: "Entregado", diferido: "Entrega diferida",
  fallo: "Falló el envío", rebote_permanente: "Rebote permanente", rebote_temporal: "Rebote temporal",
  bloqueado: "Bloqueado", invalido: "Dirección inválida", spam: "Marcado como spam", error: "Error de entrega",
};

export const ESTADOS_INCIDENCIA: EstadoEntrega[] = ["fallo", "rebote_permanente", "rebote_temporal", "bloqueado", "invalido", "spam", "error"];

type SeguimientoCanal = { estado: EstadoEntrega; fecha: string | null; destino: string | null; error: string | null };
type SeguimientoFicha = {
  id: number; nombre: string; cedula: string; junta: string; ingreso_en: string | null;
  whatsapp: SeguimientoCanal & { linea: LineaEnvioWhatsApp | null; rectificacion: boolean };
  correo: SeguimientoCanal;
  sms: SeguimientoCanal & { abierto_en: string | null; clic_en: string | null };
};

export const estadoEntregasCredenciales = () => query<SeguimientoFicha>(
  `SELECT m.id, concat(m.apellidos, ', ', m.nombres) AS nombre, m.cedula, ${juntaPublicaSql("j")} AS junta,
          jsonb_build_object('estado', coalesce(w.estado_entrega, w.estado, CASE WHEN nullif(btrim(m.telefono_e164), '') IS NULL THEN 'sin_contacto' ELSE 'sin_envio' END),
                             'fecha', coalesce(w.evento_entrega_en, w.enviado_en, w.creado_en), 'linea', w.linea_whatsapp, 'rectificacion', coalesce(w.whatsapp_rectificacion, false),
                             'destino', coalesce(w.destino, m.telefono_e164), 'error', CASE WHEN w.estado_entrega = 'error' THEN 'WhatsApp informó un error de entrega.' ELSE w.error END) AS whatsapp,
          jsonb_build_object('estado', coalesce(c.brevo_estado, c.estado, CASE WHEN nullif(btrim(m.correo), '') IS NULL THEN 'sin_contacto' ELSE 'sin_envio' END),
                             'fecha', coalesce(c.brevo_evento_en, c.enviado_en, c.creado_en),
                             'destino', coalesce(c.destino, m.correo), 'error', c.error) AS correo,
          jsonb_build_object('estado', coalesce(s.estado, CASE WHEN nullif(btrim(m.telefono_e164), '') IS NULL THEN 'sin_contacto' ELSE 'sin_envio' END),
                             'fecha', s.actualizado_en, 'destino', coalesce(s.destino, m.telefono_e164),
                             'error', s.codigo_error, 'abierto_en', a.abierto_en, 'clic_en', a.clic_en) AS sms,
          (SELECT to_json(min(l.creado_en)) FROM lecturas_puerta l WHERE l.mjrv_id = m.id AND l.resultado = 'valido' AND NOT l.es_prueba) AS ingreso_en
     FROM mjrv m JOIN juntas_madrid j ON j.id = m.junta_origen_id
     LEFT JOIN LATERAL (
       SELECT e.estado, e.enviado_en, e.creado_en, e.linea_whatsapp, e.whatsapp_rectificacion, e.destino, e.error,
              wa.estado AS estado_entrega, wa.evento_en AS evento_entrega_en
         FROM envios_credencial e LEFT JOIN entregas_whatsapp wa ON wa.envio_id = e.id AND wa.id_externo = e.id_externo
       WHERE e.mjrv_id = m.id AND e.canal = 'whatsapp' AND NOT e.simulado ORDER BY e.id DESC LIMIT 1
     ) w ON true
     LEFT JOIN LATERAL (
       SELECT e.estado, e.brevo_estado, e.brevo_evento_en, e.enviado_en, e.creado_en, e.destino, e.error FROM envios_credencial e
       WHERE e.mjrv_id = m.id AND e.canal = 'correo' AND NOT e.simulado ORDER BY e.id DESC LIMIT 1
     ) c ON true
     LEFT JOIN LATERAL (
       SELECT e.estado, e.actualizado_en, e.destino, e.codigo_error FROM envios_sms e
       WHERE e.mjrv_id = m.id ORDER BY e.id DESC LIMIT 1
     ) s ON true
     LEFT JOIN LATERAL (
       SELECT min(e.abierto_en) AS abierto_en, min(e.clic_en) AS clic_en FROM envios_sms e WHERE e.mjrv_id = m.id
     ) a ON true
     WHERE m.activo AND NOT m.es_prueba AND m.incorporado_en IS NULL
     ORDER BY j.serie, j.numero, m.apellidos, m.nombres, m.id`,
);
