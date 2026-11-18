-- M21: un solo envío vivo por persona y canal (evita duplicados por doble clic o dos pestañas). Un envío con fallo no bloquea el reintento.
-- Aditivo e idempotente; envios_credencial estaba sin uso antes de esta versión.
CREATE UNIQUE INDEX IF NOT EXISTS envios_credencial_uno_vivo
  ON cne.envios_credencial (mjrv_id, canal) WHERE estado IN ('en_cola','enviada_al_servicio','entregada');
