-- Los recibos anteriores conservan su referencia y sus valores. La nueva serie empieza en uno en cada modo.
ALTER TABLE cne.actas_pago ADD COLUMN ordinal_recibo int;
ALTER TABLE cne.actas_pago ADD CONSTRAINT actas_pago_ordinal_importes CHECK (
  ordinal_recibo IS NULL OR (
    ordinal_recibo BETWEEN 1 AND 285 AND recibo_principal
    AND importe_usd IS NOT DISTINCT FROM 70.00
    AND tipo_cambio IS NOT DISTINCT FROM 1.190
    AND importe_eur IS NOT DISTINCT FROM (CASE WHEN ordinal_recibo <= 190 THEN 58.82 ELSE 58.83 END)
  )
);
CREATE UNIQUE INDEX actas_pago_ordinal_unico ON cne.actas_pago (es_prueba, ordinal_recibo) WHERE ordinal_recibo IS NOT NULL;

-- Una fila por modo para reservar el ordinal dentro de la misma transacción que guarda el PDF.
CREATE TABLE cne.secuencia_recibos (
  es_prueba boolean PRIMARY KEY,
  ultimo_ordinal int NOT NULL DEFAULT 0 CHECK (ultimo_ordinal BETWEEN 0 AND 285)
);
INSERT INTO cne.secuencia_recibos (es_prueba) VALUES (true), (false);
ALTER TABLE cne.secuencia_recibos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cne.secuencia_recibos FORCE ROW LEVEL SECURITY;
CREATE POLICY modo ON cne.secuencia_recibos USING (es_prueba = cne.en_prueba()) WITH CHECK (es_prueba = cne.en_prueba());

UPDATE cne.configuracion SET modo_recibo = 'impresion' WHERE id = 1 AND modo_recibo <> 'impresion';
