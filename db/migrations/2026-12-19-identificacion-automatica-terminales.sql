ALTER TABLE cne.puesto_terminal_online DROP CONSTRAINT puesto_terminal_online_terminal_check;
ALTER TABLE cne.puesto_movil_actividad DROP CONSTRAINT puesto_movil_actividad_terminal_online_fkey;
ALTER TABLE cne.puesto_terminal_online ALTER COLUMN terminal TYPE integer;
ALTER TABLE cne.puesto_movil_actividad ALTER COLUMN terminal_online TYPE integer;
ALTER TABLE cne.puesto_movil_actividad ADD FOREIGN KEY (terminal_online) REFERENCES cne.puesto_terminal_online (terminal);

CREATE SEQUENCE cne.puesto_terminal_online_numero AS integer;
SELECT setval('cne.puesto_terminal_online_numero', coalesce(max(terminal), 0) + 1, false)
  FROM cne.puesto_terminal_online;
ALTER TABLE cne.puesto_terminal_online ALTER COLUMN terminal SET DEFAULT nextval('cne.puesto_terminal_online_numero');
ALTER SEQUENCE cne.puesto_terminal_online_numero OWNED BY cne.puesto_terminal_online.terminal;

ALTER TABLE cne.recuento_puesto_offline DROP CONSTRAINT recuento_puesto_offline_terminal_check;
ALTER TABLE cne.recuento_puesto_offline ALTER COLUMN terminal TYPE bigint;
ALTER TABLE cne.recuento_puesto_offline ADD CHECK (terminal BETWEEN 1 AND 999999999999999);
