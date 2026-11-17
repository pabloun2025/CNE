-- Esquema cne de Madrid (07-plan-madrid §4 sobre 01-modelo-datos). Se aplica una sola vez, en base vacía.
-- Los cambios posteriores van en db/migrations/AAAA-MM-DD-nombre.sql (solo aditivos hasta el 30-11).
CREATE SCHEMA cne;
SET search_path TO cne, public;

-- ───────────── Configuración (§8, §14) ─────────────
CREATE TABLE configuracion (
  id                          int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  modo                        text NOT NULL DEFAULT 'prueba' CHECK (modo IN ('prueba','eleccion')),
  documentos_publico_abierto  boolean NOT NULL DEFAULT false,
  actualizado_en              timestamptz NOT NULL DEFAULT now(),
  actualizado_por             bigint
);
INSERT INTO configuracion (id) VALUES (1);

-- Las tablas de actividad toman su etiqueta de prueba de aquí: el código no puede olvidarla.
CREATE FUNCTION en_prueba() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT modo = 'prueba' FROM cne.configuracion WHERE id = 1 $$;

-- Parámetros del pago (§7.5, §13.8). Todo NULL hasta que Pablo los apruebe (P-7).
CREATE TABLE parametros_pago (
  id              int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  importe_usd     numeric(12,2) CHECK (importe_usd > 0),
  tipo_cambio     numeric(14,6) CHECK (tipo_cambio > 0),
  sentido_cambio  text CHECK (sentido_cambio IN ('eur_por_usd','usd_por_eur')),
  decimales_eur   int  CHECK (decimales_eur IN (0,2)),
  redondeo        text CHECK (redondeo IN ('mitad_arriba','truncar')),
  pagador_nombre  text,
  pagador_cargo   text,
  lugar           text,
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  actualizado_por bigint
);
INSERT INTO parametros_pago (id) VALUES (1);

CREATE TABLE migraciones (
  nombre      text PRIMARY KEY,
  aplicada_en timestamptz NOT NULL DEFAULT now()
);

-- ───────────── Cuentas y sesiones (§2, §16.1) ─────────────
CREATE TABLE usuarios (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo             text NOT NULL CHECK (tipo IN ('madrid_admin','superadmin')),
  correo           text NOT NULL UNIQUE CHECK (correo = lower(correo)),
  nombre           text NOT NULL,
  password_hash    text NOT NULL,                        -- argon2id
  debe_cambiar     boolean NOT NULL DEFAULT true,
  activo           boolean NOT NULL DEFAULT true,
  fallos           int NOT NULL DEFAULT 0,
  bloqueado_hasta  timestamptz,
  es_prueba        boolean NOT NULL DEFAULT false,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  ultimo_acceso_en timestamptz
);

CREATE TABLE sesiones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash      bytea NOT NULL UNIQUE,                 -- sha256 del token de la cookie
  usuario_id      bigint NOT NULL REFERENCES usuarios(id),
  portal          text NOT NULL CHECK (portal IN ('admin','superadmin')),
  mfa_verificada  boolean NOT NULL DEFAULT false,
  creada_en       timestamptz NOT NULL DEFAULT now(),
  expira_en       timestamptz NOT NULL,
  revocada_en     timestamptz,
  ip              inet,
  agente          text
);
CREATE INDEX ON sesiones (usuario_id);

CREATE TABLE intentos_acceso (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  clave     text NOT NULL,          -- 'correo:<sha256>', 'ip:<ip>', 'operador:<id>', 'enlace:<id>', 'publico:<ip>'
  exito     boolean NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON intentos_acceso (clave, creado_en);

-- ───────────── Estaciones de Madrid (§2, §13.10) ─────────────
CREATE TABLE operadores_madrid (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre          text NOT NULL CHECK (char_length(nombre) BETWEEN 2 AND 80),
  pin_hash        text NOT NULL,                         -- argon2id; nunca en claro (§16.1)
  funciones       text[] NOT NULL CHECK (funciones <@ ARRAY['puerta','documentacion','finanzas','mando'] AND cardinality(funciones) > 0),
  activo          boolean NOT NULL DEFAULT true,
  fallos          int NOT NULL DEFAULT 0,
  bloqueado_hasta timestamptz,
  es_prueba       boolean NOT NULL DEFAULT false,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  creado_por      bigint REFERENCES usuarios(id)
);
CREATE UNIQUE INDEX ON operadores_madrid (lower(nombre)) WHERE activo;

CREATE TABLE enlaces_estacion (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  funcion       text NOT NULL CHECK (funcion IN ('puerta','documentacion','finanzas','mando')),
  etiqueta      text NOT NULL,                           -- «Puerta 1», «Finanzas 2»
  token_hash    bytea NOT NULL UNIQUE,
  token_cifrado bytea, token_nonce bytea,                -- para volver a mostrar el QR del enlace al admin
  activo        boolean NOT NULL DEFAULT true,
  bloqueado_hasta timestamptz,
  es_prueba     boolean NOT NULL DEFAULT false,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  creado_por    bigint REFERENCES usuarios(id),
  revocado_en   timestamptz
);

CREATE TABLE sesiones_estacion (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  bytea NOT NULL UNIQUE,
  enlace_id   bigint NOT NULL REFERENCES enlaces_estacion(id),
  operador_id bigint NOT NULL REFERENCES operadores_madrid(id),
  dispositivo text,
  creada_en   timestamptz NOT NULL DEFAULT now(),
  expira_en   timestamptz NOT NULL,
  revocada_en timestamptz
);
CREATE INDEX ON sesiones_estacion (enlace_id);
CREATE INDEX ON sesiones_estacion (operador_id);

-- ───────────── Juntas y MJRV de Madrid ─────────────
CREATE TABLE juntas_madrid (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  serie          text NOT NULL CHECK (serie IN ('H','M')),
  sexo           text NOT NULL CHECK (sexo IN ('hombres','mujeres')),
  numero         int  NOT NULL CHECK (numero > 0),
  zona_color     text NOT NULL CHECK (zona_color IN ('amarillo','azul','rojo','celeste','verde','rosado')),
  orden_cercania int  NOT NULL,      -- posición del bloque en la cadena física; |a-b| = distancia relativa (P-11 abierta)
  es_prueba      boolean NOT NULL DEFAULT false,
  UNIQUE (serie, numero)
);

CREATE TABLE mjrv (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cedula          text NOT NULL UNIQUE CHECK (cedula ~ '^[0-9A-Z-]{5,20}$'),  -- texto: conserva ceros a la izquierda
  apellidos       text NOT NULL,
  nombres         text NOT NULL,
  cargo_original  text NOT NULL,                                  -- tal cual el Excel (§13.2)
  rol             text NOT NULL CHECK (rol IN ('presidente','secretario','vocal','suplente','otro')),
  junta_origen_id bigint NOT NULL REFERENCES juntas_madrid(id),   -- asignación importada; nunca se sobrescribe
  rotulo_credencial text,                                         -- texto imprimible; NULL = pendiente (P-5)
  sexo_persona    text CHECK (sexo_persona IN ('hombre','mujer')),
  correo          text,
  telefono_e164   text,
  activo          boolean NOT NULL DEFAULT true,                  -- baja administrativa = false → «bloqueado» en puerta
  baja_motivo     text,
  credencial_generada_en timestamptz,
  fuente_archivo  text,
  fila_origen     int,
  es_prueba       boolean NOT NULL DEFAULT false,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON mjrv (junta_origen_id);

-- Envíos de credenciales (M21): preparación, no actividad de prueba. Todos simulados en esta versión.
CREATE TABLE envios_credencial (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mjrv_id     bigint NOT NULL REFERENCES mjrv(id),
  canal       text NOT NULL CHECK (canal IN ('whatsapp','correo')),
  destino     text NOT NULL,
  estado      text NOT NULL DEFAULT 'en_cola'
              CHECK (estado IN ('en_cola','enviada_al_servicio','fallo','entregada')),
  simulado    boolean NOT NULL DEFAULT true,
  id_externo  text,
  error       text,
  creado_por  bigint REFERENCES usuarios(id),
  creado_en   timestamptz NOT NULL DEFAULT now(),
  enviado_en  timestamptz
);
CREATE INDEX ON envios_credencial (mjrv_id);

-- ───────────── Actividad de Madrid (es_prueba según el modo) ─────────────
CREATE TABLE lecturas_puerta (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo_leido text NOT NULL,
  mjrv_id      bigint REFERENCES mjrv(id),
  resultado    text NOT NULL CHECK (resultado IN ('valido','desconocido','duplicado','bloqueado')),
  operador_id  bigint NOT NULL REFERENCES operadores_madrid(id),
  enlace_id    bigint NOT NULL REFERENCES enlaces_estacion(id),
  dispositivo  text,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  es_prueba    boolean NOT NULL DEFAULT cne.en_prueba()
);
-- Idempotencia del ingreso (§13.4): como mucho un «valido» por persona y modo.
CREATE UNIQUE INDEX lecturas_un_ingreso ON lecturas_puerta (mjrv_id, es_prueba) WHERE resultado = 'valido';
CREATE INDEX ON lecturas_puerta (mjrv_id);

CREATE TABLE excepciones_disponibilidad (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mjrv_id      bigint NOT NULL REFERENCES mjrv(id),
  motivo       text NOT NULL CHECK (char_length(motivo) BETWEEN 2 AND 200),
  activa       boolean NOT NULL DEFAULT true,
  actor_tipo   text NOT NULL CHECK (actor_tipo IN ('operador','madrid_admin')),
  actor_id     bigint NOT NULL,
  actor_nombre text NOT NULL,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  anulada_en   timestamptz,
  es_prueba    boolean NOT NULL DEFAULT cne.en_prueba()
);
CREATE UNIQUE INDEX ON excepciones_disponibilidad (mjrv_id, es_prueba) WHERE activa;

CREATE TABLE decisiones_movimiento (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mjrv_id          bigint NOT NULL REFERENCES mjrv(id),
  junta_origen_id  bigint NOT NULL REFERENCES juntas_madrid(id),  -- asignación vigente al decidir
  junta_destino_id bigint NOT NULL REFERENCES juntas_madrid(id),
  decision         text NOT NULL CHECK (decision IN ('aceptada','pasada','no_viable')),
  motivo           text,          -- obligatorio en no_viable: 'sin_respuesta' | 'negativa' | 'ausente' | texto
  manual           boolean NOT NULL DEFAULT false,
  actor_tipo       text NOT NULL CHECK (actor_tipo IN ('operador','madrid_admin')),
  actor_id         bigint NOT NULL,
  actor_nombre     text NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  es_prueba        boolean NOT NULL DEFAULT cne.en_prueba(),
  CHECK (junta_origen_id <> junta_destino_id),
  CHECK (decision <> 'no_viable' OR motivo IS NOT NULL)
);
CREATE INDEX ON decisiones_movimiento (mjrv_id, creado_en DESC);

CREATE TABLE documentos_mjrv (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mjrv_id        bigint NOT NULL REFERENCES mjrv(id),
  lado           text NOT NULL CHECK (lado IN ('anverso','reverso')),
  imagen_cifrada bytea NOT NULL,          -- JPEG re-codificado con sharp (sin EXIF) y cifrado AES-256-GCM
  nonce          bytea NOT NULL,
  bytes          int NOT NULL CHECK (bytes BETWEEN 20000 AND 2000000),
  ancho          int NOT NULL, alto int NOT NULL,
  sha256         bytea NOT NULL,           -- de la imagen en claro: impide dos fotos idénticas (§13.7)
  origen         text NOT NULL CHECK (origen IN ('publico','estacion')),
  operador_id    bigint REFERENCES operadores_madrid(id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  es_prueba      boolean NOT NULL DEFAULT cne.en_prueba(),
  UNIQUE (mjrv_id, lado, es_prueba)       -- repetir una foto la sustituye (UPSERT)
);

CREATE TABLE actas_pago (                  -- §13.8: generar/imprimir no es pagar
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mjrv_id      bigint NOT NULL REFERENCES mjrv(id),
  operador_id  bigint NOT NULL REFERENCES operadores_madrid(id),
  importe_usd  numeric(12,2) NOT NULL,
  tipo_cambio  numeric(14,6) NOT NULL,
  importe_eur  numeric(12,2) NOT NULL,
  parametros   jsonb NOT NULL,             -- copia de parametros_pago usada (trazabilidad)
  impresion_n  int NOT NULL,               -- 1 = original; >1 = «REIMPRESIÓN n»
  creado_en    timestamptz NOT NULL DEFAULT now(),
  es_prueba    boolean NOT NULL DEFAULT cne.en_prueba()
);
CREATE INDEX ON actas_pago (mjrv_id);

CREATE TABLE pagos_confirmados (           -- §7.5 requisito de control
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mjrv_id       bigint NOT NULL REFERENCES mjrv(id),
  acta_id       bigint NOT NULL REFERENCES actas_pago(id),
  importe_usd   numeric(12,2) NOT NULL,
  tipo_cambio   numeric(14,6) NOT NULL,
  importe_eur   numeric(12,2) NOT NULL,    -- euros efectivamente entregados (§15.6)
  funciones_verificadas boolean NOT NULL CHECK (funciones_verificadas),
  operador_id   bigint NOT NULL REFERENCES operadores_madrid(id),
  enlace_id     bigint NOT NULL REFERENCES enlaces_estacion(id),
  confirmado_en timestamptz NOT NULL DEFAULT now(),
  es_prueba     boolean NOT NULL DEFAULT cne.en_prueba(),
  UNIQUE (mjrv_id, es_prueba)              -- dos puestos a la vez: solo uno inserta (F-06)
);

-- ───────────── Trazabilidad y limpieza ─────────────
CREATE TABLE auditoria (                   -- §16.3: sin PIN, contraseñas ni imágenes
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal       text NOT NULL,
  actor_tipo   text NOT NULL,              -- usuario, operador, publico, sistema
  actor_id     bigint,
  actor_nombre text,
  accion       text NOT NULL,
  entidad      text, entidad_id text,
  datos        jsonb NOT NULL DEFAULT '{}',
  ip           inet,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON auditoria (creado_en DESC);

CREATE TABLE respaldo_limpieza (           -- §14.3: respaldo comprobable previo al borrado (M19)
  lote      uuid NOT NULL,
  tabla     text NOT NULL,
  fila      jsonb NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- ───────────── Vista de asignación vigente (§13.2) ─────────────
-- Junta vigente = destino de la última decisión aceptada; si no hay, la de origen. Con security_invoker aplica el filtro de modo.
CREATE VIEW v_mjrv_asignacion WITH (security_invoker = true) AS
SELECT m.id AS mjrv_id, m.junta_origen_id,
       coalesce((SELECT d.junta_destino_id FROM decisiones_movimiento d
                 WHERE d.mjrv_id = m.id AND d.decision = 'aceptada'
                 ORDER BY d.creado_en DESC, d.id DESC LIMIT 1), m.junta_origen_id) AS junta_actual_id,
       EXISTS (SELECT 1 FROM lecturas_puerta l WHERE l.mjrv_id = m.id AND l.resultado = 'valido') AS ingresado,
       EXISTS (SELECT 1 FROM excepciones_disponibilidad e WHERE e.mjrv_id = m.id AND e.activa) AS con_excepcion
FROM mjrv m WHERE m.activo;

-- ───────────── RLS: solo filtro de modo en la actividad ─────────────
-- FORCE también filtra al dueño cuando no es superusuario (alternativa Render, un solo rol).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lecturas_puerta','excepciones_disponibilidad','decisiones_movimiento','documentos_mjrv','actas_pago','pagos_confirmados'] LOOP
    EXECUTE format('ALTER TABLE cne.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE cne.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY modo ON cne.%I USING (es_prueba = cne.en_prueba()) WITH CHECK (es_prueba = cne.en_prueba())', t);
  END LOOP;
END $$;
