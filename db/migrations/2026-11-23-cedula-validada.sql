-- El financiero ve quién no tiene la cédula validada. Aditiva: no borra filas.

ALTER TABLE cne.mjrv ADD COLUMN IF NOT EXISTS cedula_validada_en timestamptz;
