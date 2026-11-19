-- La cuenta de financiero (y la de cónsul) puede abrir el módulo de pago sin un enlace de estación.
-- El pago sigue siendo uno por persona. Quien confirma queda anotado: el operador del enlace, o la cuenta.

ALTER TABLE cne.actas_pago ADD COLUMN IF NOT EXISTS usuario_id bigint REFERENCES cne.usuarios(id);
ALTER TABLE cne.actas_pago ALTER COLUMN operador_id DROP NOT NULL;
ALTER TABLE cne.actas_pago DROP CONSTRAINT IF EXISTS actas_pago_actor;
ALTER TABLE cne.actas_pago ADD CONSTRAINT actas_pago_actor CHECK (operador_id IS NOT NULL OR usuario_id IS NOT NULL);

ALTER TABLE cne.pagos_confirmados ADD COLUMN IF NOT EXISTS usuario_id bigint REFERENCES cne.usuarios(id);
ALTER TABLE cne.pagos_confirmados ALTER COLUMN operador_id DROP NOT NULL;
ALTER TABLE cne.pagos_confirmados ALTER COLUMN enlace_id DROP NOT NULL;
ALTER TABLE cne.pagos_confirmados DROP CONSTRAINT IF EXISTS pagos_confirmados_actor;
ALTER TABLE cne.pagos_confirmados ADD CONSTRAINT pagos_confirmados_actor CHECK (
  (operador_id IS NOT NULL AND enlace_id IS NOT NULL) OR usuario_id IS NOT NULL
);

ALTER TABLE cne.fichas_abiertas_finanzas ADD COLUMN IF NOT EXISTS usuario_id bigint REFERENCES cne.usuarios(id);
ALTER TABLE cne.fichas_abiertas_finanzas DROP CONSTRAINT IF EXISTS fichas_abiertas_finanzas_pkey;
ALTER TABLE cne.fichas_abiertas_finanzas ALTER COLUMN enlace_id DROP NOT NULL;
ALTER TABLE cne.fichas_abiertas_finanzas DROP CONSTRAINT IF EXISTS fichas_abiertas_enlace_unico;
ALTER TABLE cne.fichas_abiertas_finanzas ADD CONSTRAINT fichas_abiertas_enlace_unico UNIQUE (mjrv_id, enlace_id, es_prueba);
ALTER TABLE cne.fichas_abiertas_finanzas DROP CONSTRAINT IF EXISTS fichas_abiertas_un_puesto;
ALTER TABLE cne.fichas_abiertas_finanzas ADD CONSTRAINT fichas_abiertas_un_puesto CHECK (
  (enlace_id IS NOT NULL AND usuario_id IS NULL) OR (enlace_id IS NULL AND usuario_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS fichas_abiertas_usuario ON cne.fichas_abiertas_finanzas (mjrv_id, usuario_id, es_prueba) WHERE usuario_id IS NOT NULL;
