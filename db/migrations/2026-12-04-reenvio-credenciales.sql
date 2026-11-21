-- Un reenvío agrega una fila y conserva todos los intentos anteriores.
ALTER TABLE cne.envios_credencial ADD COLUMN IF NOT EXISTS reenvio boolean NOT NULL DEFAULT false;
-- Mantiene el cómputo diario de la cola después de borrar el contacto de una ficha.
ALTER TABLE cne.envios_credencial ALTER COLUMN mjrv_id DROP NOT NULL;
-- Mantiene la protección de los envíos ordinarios si se vuelve a la imagen anterior.
CREATE UNIQUE INDEX IF NOT EXISTS envios_credencial_original_por_modo
  ON cne.envios_credencial (mjrv_id, canal, simulado)
  WHERE NOT reenvio AND estado IN ('en_cola', 'enviada_al_servicio', 'entregada');
CREATE UNIQUE INDEX IF NOT EXISTS envios_credencial_uno_en_cola
  ON cne.envios_credencial (mjrv_id, canal, simulado) WHERE estado = 'en_cola';
DROP INDEX IF EXISTS cne.envios_credencial_uno_por_modo;
