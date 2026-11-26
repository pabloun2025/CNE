CREATE TABLE cne.envios_sms (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mjrv_id bigint NOT NULL REFERENCES cne.mjrv(id) ON DELETE CASCADE,
  destino text NOT NULL CHECK (destino ~ '^\+[1-9][0-9]{7,14}$'),
  remitente text NOT NULL CHECK (remitente ~ '^\+[1-9][0-9]{7,14}$'),
  estado text NOT NULL DEFAULT 'reservado' CHECK (estado IN ('reservado', 'aceptado', 'entregado', 'fallo', 'incierto')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  id_externo text UNIQUE CHECK (id_externo ~ '^[A-Za-z0-9_-]{1,32}$'),
  codigo_error text CHECK (codigo_error ~ '^[A-Z0-9_]{1,60}$'),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  abierto_en timestamptz,
  clic_en timestamptz,
  UNIQUE (mjrv_id, destino)
);

CREATE INDEX envios_sms_ficha_ultimo ON cne.envios_sms (mjrv_id, id DESC);
