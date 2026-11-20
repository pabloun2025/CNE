-- Archivo del recibo individual cifrado, sin el anexo de cédula.
ALTER TABLE cne.actas_pago ADD COLUMN IF NOT EXISTS recibo_cifrado bytea;
ALTER TABLE cne.actas_pago ADD COLUMN IF NOT EXISTS recibo_nonce bytea;

-- Los PDF firmados anteriores siguen disponibles por su propia referencia.
ALTER TABLE cne.firmas_recibo ADD COLUMN IF NOT EXISTS acta_id bigint REFERENCES cne.actas_pago(id) ON DELETE SET NULL;
