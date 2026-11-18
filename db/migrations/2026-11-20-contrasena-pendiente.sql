-- C1: la superadmin define su contraseña en el primer acceso. Cambio aditivo e idempotente.
-- password_hash NULL + password_pendiente = true: nadie puede entrar con contraseña hasta que se defina en /superadmin/acceso.
ALTER TABLE cne.usuarios ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE cne.usuarios ADD COLUMN IF NOT EXISTS password_pendiente boolean NOT NULL DEFAULT false;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_password_o_pendiente' AND conrelid = 'cne.usuarios'::regclass) THEN
    ALTER TABLE cne.usuarios ADD CONSTRAINT usuarios_password_o_pendiente CHECK (password_hash IS NOT NULL OR password_pendiente);
  END IF;
END $$;
