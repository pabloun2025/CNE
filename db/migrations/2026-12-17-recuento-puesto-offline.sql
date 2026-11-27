CREATE TABLE cne.recuento_puesto_offline (
  terminal smallint PRIMARY KEY CHECK (terminal BETWEEN 1 AND 99),
  instalacion text NOT NULL CHECK (instalacion ~ '^[a-f0-9]{16}$'),
  revision integer NOT NULL CHECK (revision BETWEEN 0 AND 2000000),
  con_padron integer NOT NULL CHECK (con_padron BETWEEN 0 AND 500000),
  sin_padron integer NOT NULL CHECK (sin_padron BETWEEN 0 AND 500000),
  otra integer NOT NULL CHECK (otra BETWEEN 0 AND 500000),
  recibido timestamptz NOT NULL DEFAULT now()
);
