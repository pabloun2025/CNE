ALTER TABLE cne.configuracion
  ADD COLUMN IF NOT EXISTS credencial_ancho_mm numeric(5,2) NOT NULL DEFAULT 54,
  ADD COLUMN IF NOT EXISTS credencial_alto_mm numeric(5,2) NOT NULL DEFAULT 85.6;
