ALTER TABLE cne.actas_pago
  ADD COLUMN version_papel_generado text,
  ADD COLUMN version_papel_impreso text,
  ADD COLUMN papel_impreso_en timestamptz;

-- La versión cambia cuando se vuelven a validar las fotos o cambia la actuación.
-- Un recibo emitido en contingencia no obtiene una versión de impresión ordinaria.
CREATE VIEW cne.v_circuito_finanzas WITH (security_invoker = true) AS
SELECT m.id AS mjrv_id, m.cedula, m.apellidos || ', ' || m.nombres AS nombre,
       j.serie, j.numero, coalesce(e.creado_en, a.creado_en) AS escaneado_en,
       e.mjrv_id IS NOT NULL OR a.version_papel_generado IS NOT NULL AS en_cola,
       a.id AS acta_id, a.version_papel_generado, estado.version,
       pendiente.acta_id IS NOT NULL AS acta_pendiente,
       estado.version IS NOT NULL AS documentado,
       CASE WHEN p.id IS NOT NULL THEN 'pagada'
            WHEN estado.version IS NULL THEN 'revision'
            WHEN pendiente.acta_id IS NULL AND a.version_papel_impreso = estado.version
                 AND a.version_papel_generado = estado.version THEN 'caja'
            ELSE 'impresion' END AS etapa
  FROM cne.mjrv m
  JOIN cne.v_mjrv_asignacion asignacion ON asignacion.mjrv_id = m.id
  JOIN cne.juntas_madrid j ON j.id = asignacion.junta_actual_id
  LEFT JOIN cne.escaneos_finanzas e ON e.mjrv_id = m.id
  LEFT JOIN cne.v_documentos_completos d ON d.mjrv_id = m.id
  LEFT JOIN cne.v_cedulas_validadas v ON v.mjrv_id = m.id
  LEFT JOIN cne.v_actuacion_mesa actuacion ON actuacion.mjrv_id = m.id
  LEFT JOIN cne.asignaciones_cargo cargo ON cargo.id = actuacion.id
  LEFT JOIN cne.v_actuacion_retirada retirado ON retirado.mjrv_id = m.id
  LEFT JOIN cne.actas_pago a ON a.mjrv_id = m.id AND a.recibo_principal AND a.importe_eur > 0
  LEFT JOIN cne.v_identidad_recibo_pendiente pendiente ON pendiente.acta_id = a.id
  LEFT JOIN cne.pagos_confirmados p ON p.mjrv_id = m.id
  LEFT JOIN LATERAL (
    SELECT encode(sha256(convert_to(jsonb_build_array(
      m.cedula, m.apellidos, m.nombres, m.cargo_original, j.id,
      v.validada_en, actuacion.id, actuacion.cargo, cargo.verificada_en,
      (SELECT jsonb_agg(jsonb_build_array(f.lado, f.creado_en, encode(f.sha256, 'hex')) ORDER BY f.lado)
         FROM cne.documentos_mjrv f
        WHERE f.mjrv_id = m.id AND f.es_prueba = cne.en_prueba())
    )::text, 'UTF8')), 'hex') AS version
    WHERE d.mjrv_id IS NOT NULL AND v.mjrv_id IS NOT NULL AND retirado.mjrv_id IS NULL
  ) estado ON true
 WHERE m.activo AND (cne.en_prueba() OR NOT m.es_prueba);
