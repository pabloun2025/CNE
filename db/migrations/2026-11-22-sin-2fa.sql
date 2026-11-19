-- El 2FA se quitó. Se borran el secreto TOTP y los códigos de recuperación; no quedan para leerlos después.
DROP TABLE IF EXISTS cne.codigos_recuperacion;
ALTER TABLE cne.usuarios
  DROP COLUMN IF EXISTS mfa_secreto,
  DROP COLUMN IF EXISTS mfa_secreto_nonce,
  DROP COLUMN IF EXISTS mfa_pendiente,
  DROP COLUMN IF EXISTS mfa_pendiente_nonce,
  DROP COLUMN IF EXISTS mfa_activada_en,
  DROP COLUMN IF EXISTS mfa_ultimo_contador;
ALTER TABLE cne.sesiones DROP COLUMN IF EXISTS mfa_verificada;
