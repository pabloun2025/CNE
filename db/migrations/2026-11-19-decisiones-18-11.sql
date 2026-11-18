-- D01 · Decisiones de Pablo del 18-11-2026 (docs/diseno/09). Aditiva e idempotente: no borra ni renombra nada.

-- 1. Importe fijo en EUR. Las columnas de USD y cambio se conservan sin uso.
ALTER TABLE cne.parametros_pago ADD COLUMN IF NOT EXISTS importe_eur numeric(12,2) CHECK (importe_eur > 0);
ALTER TABLE cne.actas_pago        ALTER COLUMN importe_usd DROP NOT NULL, ALTER COLUMN tipo_cambio DROP NOT NULL;
ALTER TABLE cne.pagos_confirmados ALTER COLUMN importe_usd DROP NOT NULL, ALTER COLUMN tipo_cambio DROP NOT NULL;

-- 5. Puerta: «Dejar pasar» un reingreso. Superconjunto del CHECK anterior.
ALTER TABLE cne.lecturas_puerta DROP CONSTRAINT IF EXISTS lecturas_puerta_resultado_check;
ALTER TABLE cne.lecturas_puerta ADD CONSTRAINT lecturas_puerta_resultado_check
  CHECK (resultado IN ('valido','desconocido','duplicado','bloqueado','reingreso_autorizado'));

-- 9. Votantes incorporados como MJRV (presentes desde que se incorporan).
ALTER TABLE cne.mjrv ADD COLUMN IF NOT EXISTS incorporado_en  timestamptz;
ALTER TABLE cne.mjrv ADD COLUMN IF NOT EXISTS incorporado_por text;

-- 9. Cargo asumido por un sustituto. El titular y el suplente de la propia junta no necesitan fila: se deducen.
CREATE TABLE IF NOT EXISTS cne.asignaciones_cargo (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mjrv_id      bigint NOT NULL REFERENCES cne.mjrv(id),
  junta_id     bigint NOT NULL REFERENCES cne.juntas_madrid(id),
  cargo        text NOT NULL CHECK (cargo IN ('presidente','secretario','vocal')),
  origen       text NOT NULL CHECK (origen IN ('traslado','incorporado','manual')),
  activa       boolean NOT NULL DEFAULT true,
  actor_tipo   text NOT NULL CHECK (actor_tipo IN ('operador','madrid_admin')),
  actor_id     bigint NOT NULL,
  actor_nombre text NOT NULL,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  anulada_en   timestamptz,
  es_prueba    boolean NOT NULL DEFAULT cne.en_prueba()
);
CREATE UNIQUE INDEX IF NOT EXISTS asignaciones_cargo_persona ON cne.asignaciones_cargo (mjrv_id, es_prueba) WHERE activa;
CREATE UNIQUE INDEX IF NOT EXISTS asignaciones_cargo_puesto  ON cne.asignaciones_cargo (junta_id, cargo, es_prueba) WHERE activa;

-- 10c. Quién tiene abierta una ficha en finanzas (aviso, nunca bloqueo).
CREATE TABLE IF NOT EXISTS cne.fichas_abiertas_finanzas (
  mjrv_id         bigint NOT NULL REFERENCES cne.mjrv(id),
  enlace_id       bigint NOT NULL REFERENCES cne.enlaces_estacion(id),
  operador_nombre text NOT NULL,
  abierta_en      timestamptz NOT NULL DEFAULT now(),
  es_prueba       boolean NOT NULL DEFAULT cne.en_prueba(),
  PRIMARY KEY (mjrv_id, enlace_id, es_prueba)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['asignaciones_cargo','fichas_abiertas_finanzas'] LOOP
    EXECUTE format('ALTER TABLE cne.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE cne.%I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'cne' AND tablename = t AND policyname = 'modo') THEN
      EXECUTE format('CREATE POLICY modo ON cne.%I USING (es_prueba = cne.en_prueba()) WITH CHECK (es_prueba = cne.en_prueba())', t);
    END IF;
  END LOOP;
END $$;

-- 4. Envíos reales: interruptores (por defecto simulado), línea de CNE, remitente y pausa por fallos.
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS whatsapp_real            boolean NOT NULL DEFAULT false;
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS correo_real              boolean NOT NULL DEFAULT false;
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS whatsapp_numero          text;
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS correo_remitente         text;
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS correo_remitente_nombre  text;
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS whatsapp_proximo_en      timestamptz;
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS correo_proximo_en        timestamptz;
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS whatsapp_pausa_motivo    text;
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS correo_pausa_motivo      text;
ALTER TABLE cne.envios_credencial ADD COLUMN IF NOT EXISTS intentos int NOT NULL DEFAULT 0;

-- 9. La persona incorporada está presente sin lectura de puerta. Mismas columnas y orden.
CREATE OR REPLACE VIEW cne.v_mjrv_asignacion WITH (security_invoker = true) AS
SELECT m.id AS mjrv_id, m.junta_origen_id,
       coalesce((SELECT d.junta_destino_id FROM cne.decisiones_movimiento d
                 WHERE d.mjrv_id = m.id AND d.decision = 'aceptada'
                 ORDER BY d.creado_en DESC, d.id DESC LIMIT 1), m.junta_origen_id) AS junta_actual_id,
       (m.incorporado_en IS NOT NULL
        OR EXISTS (SELECT 1 FROM cne.lecturas_puerta l WHERE l.mjrv_id = m.id AND l.resultado = 'valido')) AS ingresado,
       EXISTS (SELECT 1 FROM cne.excepciones_disponibilidad e WHERE e.mjrv_id = m.id AND e.activa) AS con_excepcion
FROM cne.mjrv m WHERE m.activo;
