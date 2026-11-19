-- Revocación del acceso de una credencial (19-11-2026, 10:46 Madrid). Aditiva: no borra filas.
-- No es actividad de la jornada: vale igual en prueba y en elección. Quien no tiene ficha también cabe (mjrv_id nulo).

CREATE TABLE IF NOT EXISTS cne.credenciales_revocadas (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mjrv_id      bigint UNIQUE REFERENCES cne.mjrv(id) ON DELETE CASCADE,
  cedula       text NOT NULL CHECK (cedula ~ '^[0-9A-Z-]{5,20}$'),
  apellidos    text NOT NULL DEFAULT '',
  nombres      text NOT NULL DEFAULT '',
  claves       text[] NOT NULL DEFAULT '{}',
  revocada_en  timestamptz NOT NULL DEFAULT now(),
  actor_id     bigint,
  actor_nombre text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS credenciales_revocadas_cedula ON cne.credenciales_revocadas (cedula);

ALTER TABLE cne.lecturas_puerta DROP CONSTRAINT IF EXISTS lecturas_puerta_resultado_check;
ALTER TABLE cne.lecturas_puerta ADD CONSTRAINT lecturas_puerta_resultado_check
  CHECK (resultado IN ('valido','desconocido','duplicado','bloqueado','reingreso_autorizado','revocado'));
