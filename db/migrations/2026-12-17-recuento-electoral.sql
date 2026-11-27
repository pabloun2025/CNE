ALTER TABLE cne.puesto_movil_actividad
  ADD COLUMN equipo bigint CHECK (equipo BETWEEN 1 AND 999999999999),
  ADD COLUMN solicitud uuid,
  ADD CONSTRAINT puesto_movil_actividad_solicitud_unica UNIQUE (equipo, solicitud),
  ADD CHECK ((equipo IS NULL) = (solicitud IS NULL));

CREATE TABLE cne.cortes_puesto_windows (
  equipo bigint PRIMARY KEY CHECK (equipo BETWEEN 1 AND 999999999999),
  total integer NOT NULL CHECK (total BETWEEN 1 AND 16777215),
  sin integer NOT NULL CHECK (sin BETWEEN 0 AND total)
);

-- Abrir un justificante ya no consume un cupo ni requiere una fila de aperturas.
ALTER TABLE cne.envios_justificante DROP CONSTRAINT envios_justificante_documento_fkey;
