CREATE TABLE cne.entregas_whatsapp (
  envio_id bigint NOT NULL REFERENCES cne.envios_credencial(id) ON DELETE CASCADE,
  id_externo text NOT NULL CHECK (length(id_externo) BETWEEN 1 AND 128),
  estado text NOT NULL CHECK (estado IN ('entregado', 'error')),
  evento_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (envio_id, id_externo)
);
