CREATE TABLE cne.acreditaciones_embajada (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  nombre text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 150),
  cargo text NOT NULL CHECK (char_length(cargo) BETWEEN 1 AND 100),
  contactos_hash text NOT NULL CHECK (contactos_hash ~ '^[a-f0-9]{64}$'),
  revocada_en timestamptz
);

CREATE TABLE cne.acreditaciones_embajada_envios (
  token_hash text NOT NULL REFERENCES cne.acreditaciones_embajada(token_hash),
  canal text NOT NULL CHECK (canal IN ('correo', 'sms')),
  estado text NOT NULL CHECK (estado IN ('en_curso', 'incierto', 'aceptado', 'rechazado')),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (token_hash, canal)
);
