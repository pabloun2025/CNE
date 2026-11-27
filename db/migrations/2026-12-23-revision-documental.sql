ALTER TABLE cne.cedulas_validadas
  ALTER COLUMN validada_en DROP NOT NULL,
  ADD COLUMN retirada_en timestamptz,
  ADD COLUMN repetir_en timestamptz,
  ADD COLUMN motivo_repetir text;

CREATE OR REPLACE VIEW cne.v_cedulas_validadas WITH (security_invoker = true) AS
SELECT v.mjrv_id, v.validada_en FROM cne.cedulas_validadas v
 WHERE v.es_prueba = cne.en_prueba() AND v.validada_en IS NOT NULL
   AND (v.retirada_en IS NULL OR v.validada_en > v.retirada_en)
   AND NOT EXISTS (
     SELECT 1 FROM cne.documentos_mjrv d
      WHERE d.mjrv_id = v.mjrv_id AND d.es_prueba = v.es_prueba AND d.creado_en > v.validada_en
   );

CREATE VIEW cne.v_documentos_por_repetir WITH (security_invoker = true) AS
SELECT v.mjrv_id, v.repetir_en, v.motivo_repetir FROM cne.cedulas_validadas v
 WHERE v.es_prueba = cne.en_prueba() AND v.repetir_en IS NOT NULL
   AND (v.validada_en IS NULL OR v.validada_en <= v.repetir_en)
   AND EXISTS (
     SELECT 1 FROM cne.documentos_mjrv d
      WHERE d.mjrv_id = v.mjrv_id AND d.es_prueba = v.es_prueba
   );
