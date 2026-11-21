-- En Puerta y Documentación el enlace identifica el puesto.
ALTER TABLE cne.lecturas_puerta ALTER COLUMN operador_id DROP NOT NULL;
ALTER TABLE cne.documentos_mjrv ADD COLUMN IF NOT EXISTS enlace_id bigint REFERENCES cne.enlaces_estacion(id);

-- Un escaneo identifica una ficha por modo, sin abrir el pago ni emitir un recibo.
CREATE TABLE IF NOT EXISTS cne.escaneos_finanzas (
  mjrv_id    bigint NOT NULL REFERENCES cne.mjrv(id) ON DELETE CASCADE,
  enlace_id  bigint NOT NULL REFERENCES cne.enlaces_estacion(id),
  creado_en  timestamptz NOT NULL DEFAULT now(),
  es_prueba  boolean NOT NULL DEFAULT cne.en_prueba(),
  PRIMARY KEY (mjrv_id, es_prueba)
);
ALTER TABLE cne.escaneos_finanzas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cne.escaneos_finanzas FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS modo ON cne.escaneos_finanzas;
CREATE POLICY modo ON cne.escaneos_finanzas
  USING (es_prueba = cne.en_prueba()) WITH CHECK (es_prueba = cne.en_prueba());
