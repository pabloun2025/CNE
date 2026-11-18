-- M18: verificación en dos pasos (TOTP) de la superadministración. Cambio aditivo e idempotente.
-- El secreto va cifrado con APP_MASTER_KEY (AES-256-GCM); los códigos de recuperación, solo como huella sha256.
ALTER TABLE cne.usuarios ADD COLUMN IF NOT EXISTS mfa_secreto bytea;
ALTER TABLE cne.usuarios ADD COLUMN IF NOT EXISTS mfa_secreto_nonce bytea;
ALTER TABLE cne.usuarios ADD COLUMN IF NOT EXISTS mfa_pendiente bytea;          -- secreto y códigos propuestos hasta demostrar que la aplicación funciona
ALTER TABLE cne.usuarios ADD COLUMN IF NOT EXISTS mfa_pendiente_nonce bytea;
ALTER TABLE cne.usuarios ADD COLUMN IF NOT EXISTS mfa_activada_en timestamptz;
ALTER TABLE cne.usuarios ADD COLUMN IF NOT EXISTS mfa_ultimo_contador bigint;   -- impide reutilizar un código

CREATE TABLE IF NOT EXISTS cne.codigos_recuperacion (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  bigint NOT NULL REFERENCES cne.usuarios(id),
  codigo_hash text NOT NULL,
  usado_en    timestamptz,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, codigo_hash)
);
