-- Módulo compartido de impresión y, aparte, la firma digital. Ninguno de los dos confirma el pago.

ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS modo_recibo text NOT NULL DEFAULT 'impresion';
ALTER TABLE cne.configuracion DROP CONSTRAINT IF EXISTS configuracion_modo_recibo;
ALTER TABLE cne.configuracion ADD CONSTRAINT configuracion_modo_recibo CHECK (modo_recibo IN ('impresion','digital'));

CREATE TABLE IF NOT EXISTS cne.pendientes_impresion (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mjrv_id     bigint NOT NULL REFERENCES cne.mjrv(id),
  junta       text NOT NULL,
  usuario_id  bigint REFERENCES cne.usuarios(id),
  creado_en   timestamptz NOT NULL DEFAULT now(),
  impreso_en  timestamptz,
  es_prueba   boolean NOT NULL DEFAULT cne.en_prueba()
);
CREATE UNIQUE INDEX IF NOT EXISTS pendientes_impresion_abierto ON cne.pendientes_impresion (mjrv_id, es_prueba) WHERE impreso_en IS NULL;

CREATE TABLE IF NOT EXISTS cne.firmas_recibo (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mjrv_id     bigint NOT NULL REFERENCES cne.mjrv(id),
  usuario_id  bigint REFERENCES cne.usuarios(id),
  pdf         bytea NOT NULL,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  es_prueba   boolean NOT NULL DEFAULT cne.en_prueba()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pendientes_impresion','firmas_recibo'] LOOP
    EXECUTE format('ALTER TABLE cne.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE cne.%I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'cne' AND tablename = t AND policyname = 'modo') THEN
      EXECUTE format('CREATE POLICY modo ON cne.%I USING (es_prueba = cne.en_prueba()) WITH CHECK (es_prueba = cne.en_prueba())', t);
    END IF;
  END LOOP;
END $$;
