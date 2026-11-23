ALTER TABLE cne.envios_credencial
  ADD COLUMN whatsapp_rectificacion boolean NOT NULL DEFAULT false,
  ADD CHECK (NOT whatsapp_rectificacion OR canal = 'whatsapp');
