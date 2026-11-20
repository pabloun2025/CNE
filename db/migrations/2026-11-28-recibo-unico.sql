-- Las emisiones antiguas siguen consultables. Se prioriza el acta pagada y luego la primera con importe en EUR.
ALTER TABLE cne.actas_pago ADD COLUMN IF NOT EXISTS recibo_principal boolean NOT NULL DEFAULT false;
WITH principales AS (
  SELECT DISTINCT ON (a.mjrv_id, a.es_prueba) a.id
    FROM cne.actas_pago a
    LEFT JOIN cne.pagos_confirmados p ON p.acta_id = a.id
   WHERE NOT EXISTS (
     SELECT 1 FROM cne.actas_pago x
     WHERE x.mjrv_id = a.mjrv_id AND x.es_prueba = a.es_prueba AND x.recibo_principal
   )
   ORDER BY a.mjrv_id, a.es_prueba, (p.id IS NOT NULL) DESC, (a.importe_eur IS NOT NULL) DESC, a.id
)
UPDATE cne.actas_pago a SET recibo_principal = true FROM principales WHERE principales.id = a.id;
CREATE UNIQUE INDEX IF NOT EXISTS actas_pago_recibo_principal
  ON cne.actas_pago (mjrv_id, es_prueba) WHERE recibo_principal;
ALTER TABLE cne.actas_pago ALTER COLUMN recibo_principal SET DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS firmas_recibo_acta
  ON cne.firmas_recibo (acta_id) WHERE acta_id IS NOT NULL;
