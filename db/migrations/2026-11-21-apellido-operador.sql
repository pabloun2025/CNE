-- La puerta identifica al operador con nombre, apellido y PIN. Aditiva: no borra filas.

ALTER TABLE cne.operadores_madrid ADD COLUMN IF NOT EXISTS apellido text NOT NULL DEFAULT '';
ALTER TABLE cne.operadores_madrid DROP CONSTRAINT IF EXISTS operadores_madrid_apellido_len;
ALTER TABLE cne.operadores_madrid ADD CONSTRAINT operadores_madrid_apellido_len CHECK (char_length(apellido) <= 80);

-- El nombre solo ya no es único: dos personas pueden llamarse igual si el apellido cambia.
DO $$
DECLARE i text;
BEGIN
  FOR i IN
    SELECT indexname FROM pg_indexes
     WHERE schemaname = 'cne' AND tablename = 'operadores_madrid'
       AND indexdef ILIKE '%unique%' AND indexdef ILIKE '%lower(nombre)%' AND indexdef NOT ILIKE '%apellido%'
  LOOP
    EXECUTE format('DROP INDEX cne.%I', i);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS operadores_madrid_nombre_apellido_activo
  ON cne.operadores_madrid (lower(nombre), lower(apellido)) WHERE activo;
