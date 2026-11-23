-- La línea 1 conserva las columnas y la vinculación existentes.
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS whatsapp_real_2 boolean NOT NULL DEFAULT false;
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS whatsapp_numero_2 text;
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS whatsapp_proximo_en_2 timestamptz;
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS whatsapp_pausa_motivo_2 text;
