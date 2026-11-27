ALTER TABLE cne.usuarios
  DROP CONSTRAINT usuarios_tipo_check,
  DROP CONSTRAINT usuarios_rol_valido,
  ADD CONSTRAINT usuarios_tipo_check CHECK (tipo IN ('madrid_admin', 'madrid_documentacion', 'madrid_mesas', 'superadmin')),
  ADD CONSTRAINT usuarios_rol_valido CHECK (
    (tipo = 'madrid_documentacion' AND rol = 'validador')
    OR (tipo = 'madrid_mesas' AND rol = 'verificador_mesas')
    OR (tipo IN ('madrid_admin', 'superadmin') AND rol IN ('consul', 'coordinador', 'financiero'))
  );

ALTER TABLE cne.asignaciones_cargo ADD COLUMN verificada_en timestamptz;

CREATE VIEW cne.v_actuacion_mesa WITH (security_invoker = true) AS
SELECT a.id, a.mjrv_id, a.junta_id, a.cargo, j.serie || j.numero AS junta
  FROM cne.asignaciones_cargo a
  JOIN cne.juntas_madrid j ON j.id = a.junta_id
  JOIN cne.v_mjrv_asignacion m ON m.mjrv_id = a.mjrv_id AND m.junta_actual_id = a.junta_id
 WHERE a.activa AND a.es_prueba = cne.en_prueba() AND a.verificada_en IS NOT NULL;

CREATE OR REPLACE VIEW cne.v_identidad_recibo_pendiente WITH (security_invoker = true) AS
SELECT a.id AS acta_id
  FROM cne.actas_pago a
  JOIN cne.mjrv m ON m.id = a.mjrv_id
  JOIN cne.v_documentos_completos d ON d.mjrv_id = a.mjrv_id
  LEFT JOIN cne.documentos_mjrv pp ON pp.mjrv_id = a.mjrv_id AND pp.es_prueba = a.es_prueba AND pp.lado = 'pasaporte'
  LEFT JOIN cne.v_actuacion_mesa v ON v.mjrv_id = m.id
 WHERE a.es_prueba = cne.en_prueba() AND a.recibo_principal AND a.importe_eur > 0
   AND NOT EXISTS (SELECT 1 FROM cne.pagos_confirmados p WHERE p.mjrv_id = a.mjrv_id AND p.es_prueba = a.es_prueba)
   AND (
     (pp.id IS NOT NULL) IS DISTINCT FROM coalesce(a.parametros #>> '{persona_recibo,tipoDocumento}' = 'pasaporte', false)
     OR (pp.id IS NOT NULL AND a.parametros #>> '{persona_recibo,cedula}' IS DISTINCT FROM m.cedula)
     OR (v.id IS NOT NULL AND (
       a.parametros #>> '{persona_recibo,cargo}' IS DISTINCT FROM upper(v.cargo)
       OR a.parametros #>> '{persona_recibo,juntaVigente}' IS DISTINCT FROM v.junta
     ))
   );

-- La constatación presencial en mesa acredita presencia aunque no conste un paso por Puerta.
CREATE OR REPLACE VIEW cne.v_mjrv_asignacion WITH (security_invoker = true) AS
SELECT m.id AS mjrv_id, m.junta_origen_id,
       coalesce((SELECT d.junta_destino_id FROM cne.decisiones_movimiento d
                 WHERE d.mjrv_id = m.id AND d.decision = 'aceptada'
                 ORDER BY d.creado_en DESC, d.id DESC LIMIT 1), m.junta_origen_id) AS junta_actual_id,
       (m.incorporado_en IS NOT NULL
        OR EXISTS (SELECT 1 FROM cne.lecturas_puerta l WHERE l.mjrv_id = m.id AND l.resultado = 'valido')
        OR EXISTS (SELECT 1 FROM cne.asignaciones_cargo a WHERE a.mjrv_id = m.id AND a.activa
                    AND a.es_prueba = cne.en_prueba() AND a.verificada_en IS NOT NULL)) AS ingresado,
       EXISTS (SELECT 1 FROM cne.excepciones_disponibilidad e WHERE e.mjrv_id = m.id AND e.activa) AS con_excepcion
FROM cne.mjrv m WHERE m.activo;
