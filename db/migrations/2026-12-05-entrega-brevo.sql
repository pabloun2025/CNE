-- El estado operativo de la cola y el resultado del proveedor se guardan por separado.
ALTER TABLE cne.envios_credencial
  ADD COLUMN brevo_estado text,
  ADD COLUMN brevo_evento_en timestamptz,
  ADD CONSTRAINT envios_brevo_estado_valido CHECK (
    brevo_estado IS NULL OR (
      canal = 'correo' AND NOT simulado AND brevo_evento_en IS NOT NULL
      AND brevo_estado IN ('aceptado','diferido','entregado','rebote_permanente','rebote_temporal','bloqueado','invalido','spam','error')
    )
  );

CREATE INDEX envios_brevo_mensaje ON cne.envios_credencial (btrim(id_externo, '<>'))
  WHERE canal = 'correo' AND NOT simulado AND id_externo IS NOT NULL;
