-- Los envíos existentes conservan la línea vinculada originalmente.
ALTER TABLE cne.envios_credencial
  ADD COLUMN linea_whatsapp smallint NOT NULL DEFAULT 1 CHECK (linea_whatsapp IN (1, 2));
