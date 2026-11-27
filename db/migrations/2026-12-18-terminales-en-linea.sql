CREATE TABLE cne.puesto_terminal_online (
  terminal smallint PRIMARY KEY CHECK (terminal BETWEEN 1 AND 99),
  instalacion text UNIQUE CHECK (instalacion ~ '^[a-f0-9]{16}$')
);

ALTER TABLE cne.puesto_movil_actividad ADD COLUMN terminal_online smallint
  REFERENCES cne.puesto_terminal_online (terminal);
CREATE INDEX puesto_movil_actividad_terminal_online ON cne.puesto_movil_actividad (terminal_online);
