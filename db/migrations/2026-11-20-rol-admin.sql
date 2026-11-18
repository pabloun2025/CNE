-- C2: rol de las cuentas de administración de Madrid (consul, coordinador, financiero). Aditivo e idempotente.
-- Las cuentas existentes quedan como «consul» (acceso completo, como hasta ahora).
ALTER TABLE cne.usuarios ADD COLUMN IF NOT EXISTS rol text NOT NULL DEFAULT 'consul';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_rol_valido' AND conrelid = 'cne.usuarios'::regclass) THEN
    ALTER TABLE cne.usuarios ADD CONSTRAINT usuarios_rol_valido CHECK (rol IN ('consul','coordinador','financiero'));
  END IF;
END $$;
