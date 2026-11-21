ALTER TABLE cne.documentos_mjrv
  DROP CONSTRAINT documentos_mjrv_lado_check,
  ADD CONSTRAINT documentos_mjrv_lado_check CHECK (lado IN ('anverso', 'reverso', 'pasaporte')),
  ADD COLUMN numero_pasaporte text,
  ADD CONSTRAINT documentos_mjrv_numero_pasaporte_check CHECK (
    (lado = 'pasaporte' AND numero_pasaporte IS NOT NULL AND numero_pasaporte ~ '^[A-Z0-9][A-Z0-9-]{4,19}$') OR
    (lado <> 'pasaporte' AND numero_pasaporte IS NULL)
  );

CREATE VIEW cne.v_documentos_completos WITH (security_invoker = true) AS
SELECT mjrv_id
  FROM cne.documentos_mjrv
 WHERE es_prueba = cne.en_prueba()
 GROUP BY mjrv_id
HAVING bool_or(lado = 'pasaporte')
    OR (bool_or(lado = 'anverso') AND bool_or(lado = 'reverso'));

-- Caja exige que el recibo pendiente tenga el mismo pasaporte que la ficha.
-- Los recibos de cédula anteriores a esta migración no guardaban el tipo.
CREATE VIEW cne.v_identidad_recibo_pendiente WITH (security_invoker = true) AS
SELECT a.id AS acta_id
  FROM cne.actas_pago a
  JOIN cne.v_documentos_completos d ON d.mjrv_id = a.mjrv_id
  LEFT JOIN cne.documentos_mjrv pp ON pp.mjrv_id = a.mjrv_id AND pp.es_prueba = a.es_prueba AND pp.lado = 'pasaporte'
 WHERE a.es_prueba = cne.en_prueba() AND a.recibo_principal AND a.importe_eur > 0
   AND NOT EXISTS (SELECT 1 FROM cne.pagos_confirmados p WHERE p.mjrv_id = a.mjrv_id AND p.es_prueba = a.es_prueba)
   AND CASE WHEN pp.numero_pasaporte IS NULL THEN a.parametros #>> '{persona_recibo,tipoDocumento}' = 'pasaporte'
            ELSE a.parametros #>> '{persona_recibo,tipoDocumento}' IS DISTINCT FROM 'pasaporte'
              OR a.parametros #>> '{persona_recibo,cedula}' IS DISTINCT FROM pp.numero_pasaporte END;
