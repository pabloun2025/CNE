-- Bandeja independiente de la cola. El cuerpo se guarda cifrado y se elimina con la ficha.
CREATE TABLE cne.whatsapp_respuestas (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  linea           smallint NOT NULL CHECK (linea IN (1, 2)),
  id_externo      text NOT NULL CHECK (char_length(id_externo) BETWEEN 1 AND 128),
  mjrv_id         bigint NOT NULL REFERENCES cne.mjrv(id) ON DELETE CASCADE,
  recibido_en     timestamptz NOT NULL,
  texto_cifrado   bytea NOT NULL CHECK (octet_length(texto_cifrado) BETWEEN 17 AND 4016),
  texto_nonce     bytea NOT NULL CHECK (octet_length(texto_nonce) = 12),
  ultimo_envio_en timestamptz,
  UNIQUE (linea, id_externo)
);
CREATE INDEX whatsapp_respuestas_bandeja ON cne.whatsapp_respuestas (linea, recibido_en DESC, id DESC);
CREATE INDEX whatsapp_respuestas_mjrv ON cne.whatsapp_respuestas (mjrv_id);
