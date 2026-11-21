-- El pasaporte aporta una foto. La cédula del padrón identifica el recibo.
ALTER TABLE cne.documentos_mjrv DROP CONSTRAINT documentos_mjrv_numero_pasaporte_check;

CREATE OR REPLACE VIEW cne.v_identidad_recibo_pendiente WITH (security_invoker = true) AS
SELECT a.id AS acta_id
  FROM cne.actas_pago a
  JOIN cne.mjrv m ON m.id = a.mjrv_id
  JOIN cne.v_documentos_completos d ON d.mjrv_id = a.mjrv_id
  LEFT JOIN cne.documentos_mjrv pp ON pp.mjrv_id = a.mjrv_id AND pp.es_prueba = a.es_prueba AND pp.lado = 'pasaporte'
 WHERE a.es_prueba = cne.en_prueba() AND a.recibo_principal AND a.importe_eur > 0
   AND NOT EXISTS (SELECT 1 FROM cne.pagos_confirmados p WHERE p.mjrv_id = a.mjrv_id AND p.es_prueba = a.es_prueba)
   AND (
     (pp.id IS NOT NULL) IS DISTINCT FROM coalesce(a.parametros #>> '{persona_recibo,tipoDocumento}' = 'pasaporte', false)
     OR (pp.id IS NOT NULL AND a.parametros #>> '{persona_recibo,cedula}' IS DISTINCT FROM m.cedula)
   );
