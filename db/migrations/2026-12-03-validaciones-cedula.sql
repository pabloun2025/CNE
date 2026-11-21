CREATE TABLE cne.cedulas_validadas (
  mjrv_id bigint NOT NULL REFERENCES cne.mjrv(id) ON DELETE CASCADE,
  es_prueba boolean NOT NULL DEFAULT cne.en_prueba(),
  validada_en timestamptz NOT NULL,
  PRIMARY KEY (mjrv_id, es_prueba)
);

-- La fecha antigua no guardaba el modo. Se recupera cuando las fotos de un único
-- modo la respaldan, o, si ya se borraron, cuando queda un pago posterior en un único modo.
ALTER TABLE cne.documentos_mjrv NO FORCE ROW LEVEL SECURITY;
ALTER TABLE cne.pagos_confirmados NO FORCE ROW LEVEL SECURITY;
WITH evidencias AS (
  SELECT m.id, d.es_prueba, m.cedula_validada_en
    FROM cne.mjrv m JOIN cne.documentos_mjrv d ON d.mjrv_id = m.id
   WHERE m.cedula_validada_en IS NOT NULL
   GROUP BY m.id, d.es_prueba
  HAVING count(DISTINCT d.lado) = 2 AND max(d.creado_en) <= m.cedula_validada_en
  UNION ALL
  SELECT m.id, p.es_prueba, m.cedula_validada_en
    FROM cne.mjrv m JOIN cne.pagos_confirmados p ON p.mjrv_id = m.id
   WHERE p.confirmado_en >= m.cedula_validada_en
     AND NOT EXISTS (SELECT 1 FROM cne.documentos_mjrv d WHERE d.mjrv_id = m.id)
)
INSERT INTO cne.cedulas_validadas (mjrv_id, es_prueba, validada_en)
SELECT id, bool_or(es_prueba), min(cedula_validada_en)
  FROM evidencias GROUP BY id HAVING count(*) = 1;
ALTER TABLE cne.documentos_mjrv FORCE ROW LEVEL SECURITY;
ALTER TABLE cne.pagos_confirmados FORCE ROW LEVEL SECURITY;

ALTER TABLE cne.cedulas_validadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cne.cedulas_validadas FORCE ROW LEVEL SECURITY;
CREATE POLICY modo ON cne.cedulas_validadas
  USING (es_prueba = cne.en_prueba()) WITH CHECK (es_prueba = cne.en_prueba());

-- El informe conserva la fecha si se borran las fotos. Una foto posterior obliga a revisar otra vez.
CREATE VIEW cne.v_cedulas_validadas WITH (security_invoker = true) AS
SELECT v.mjrv_id, v.validada_en FROM cne.cedulas_validadas v
 WHERE v.es_prueba = cne.en_prueba()
   AND NOT EXISTS (
     SELECT 1 FROM cne.documentos_mjrv d
      WHERE d.mjrv_id = v.mjrv_id AND d.es_prueba = v.es_prueba AND d.creado_en > v.validada_en
   );
