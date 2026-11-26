CREATE TABLE cne.envios_justificante (
  documento text NOT NULL REFERENCES cne.aperturas_justificante (documento) ON DELETE CASCADE,
  solicitud uuid NOT NULL,
  estado text NOT NULL CHECK (estado IN ('disponible','enviando','aceptado','incierto')),
  PRIMARY KEY (documento, solicitud)
);
