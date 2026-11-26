CREATE TABLE cne.puesto_movil_actividad (
  id uuid PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('con','sin')),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviando','aceptado','incierto')),
  intentos smallint NOT NULL DEFAULT 0 CHECK (intentos BETWEEN 0 AND 3),
  envio_iniciado timestamptz,
  huella_peticion text CHECK (huella_peticion IS NULL OR huella_peticion ~ '^[0-9a-f]{64}$')
);
