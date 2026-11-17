# 01 · Modelo de datos — PostgreSQL 16, esquema `cne`

Trazado a la especificación (§n). Los bloques SQL de §2–§4 se han ejecutado tal cual en PostgreSQL 16 el 17-11-2026 (crean sin errores; comprobado: RLS por consulado, Madrid invisible para Quito, filtro por modo prueba, ingreso idempotente, pago único). Convenciones: claves `bigint generated always as identity` salvo tokens/idempotencia (`uuid`); horas en `timestamptz`; textos de estado como `text` + `CHECK` (más fáciles de migrar que `enum`); nombres en español sin tildes.

**Reglas generales**
- Tablas **maestras**: `es_prueba boolean NOT NULL DEFAULT false`. Solo `scripts/demo-data.ts` escribe `true`.
- Tablas de **actividad**: `es_prueba boolean NOT NULL DEFAULT cne.en_prueba()` + política RLS `es_prueba = cne.en_prueba()` (§8, §14.3 «identificador inequívoco desde el primer registro»).
- Sin `DELETE` para `cne_app` en tablas de actividad (salvo `atenciones_finanzas`): la limpieza de pruebas la hace `cne_owner`.
- Cada escritura de un portal guarda autor (`operador_nombre`/`actor_*`) y `recibido_en = now()` del servidor (§15.2, §16.3).
- Migraciones idempotentes en `db/migrations/AAAA-MM-DD-nombre.sql`; `db/schema.sql` crea todo en base vacía; solo cambios **aditivos** hasta el 30-11 (permite revertir código sin restaurar la base).

## 1. Roles y conexión

```sql
-- docker/postgres-init.sh (primer arranque del contenedor): crea el rol de la aplicación.
-- POSTGRES_USER = cne_owner (dueño del esquema), base cne.
CREATE ROLE cne_app LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE cne TO cne_app;
```

Conexiones (`src/server/db.ts`, copiado de consulares y reducido):
- `DATABASE_URL` → `cne_app` (web y trabajador), `search_path=cne,public`, pool 10.
- `DATABASE_ADMIN_URL` → `cne_owner` (solo `cne-migrate`, limpieza de pruebas e importaciones masivas de la superadmin), pool 2.

`withPortal(scope, fn)`: abre transacción y ejecuta
```sql
SELECT set_config('cne.portal', $1, true), set_config('cne.consulado_id', coalesce($2,''), true);
```
`scope.portal ∈ {consular, dgsmh, madrid, admin, worker, publico}`. **Toda** consulta de negocio pasa por `withPortal`; fuera de ella `cne.portal()` vale `''` y las políticas no devuelven filas (fallo seguro). `publico` = formulario del QR genérico de documentos.

## 2. Esquema SQL

```sql
CREATE SCHEMA IF NOT EXISTS cne;
SET search_path TO cne, public;

-- ───────────── Configuración global (§8, §14) ─────────────
CREATE TABLE configuracion (
  id                int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  modo              text NOT NULL DEFAULT 'prueba' CHECK (modo IN ('prueba','eleccion')),
  margen_alerta_min int CHECK (margen_alerta_min BETWEEN 1 AND 600),   -- NULL = alertas por ausencia desactivadas (P-16)
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  actualizado_por   bigint
);
INSERT INTO configuracion (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE FUNCTION en_prueba() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT modo = 'prueba' FROM cne.configuracion WHERE id = 1 $$;
CREATE FUNCTION portal() RETURNS text LANGUAGE sql STABLE AS
  $$ SELECT coalesce(current_setting('cne.portal', true), '') $$;
CREATE FUNCTION consulado_actual() RETURNS bigint LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('cne.consulado_id', true), '')::bigint $$;

-- Parámetros del pago de Madrid (§7.5, §13.8). Todo NULL hasta que Pablo lo apruebe (P-7).
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
INSERT INTO parametros_pago (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ───────────── Catálogo consular (§3, §10.3, §15.1) ─────────────
CREATE TABLE consulados (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo               text NOT NULL UNIQUE,             -- clave estable del archivo fuente
  nombre               text NOT NULL,
  ciudad               text,
  pais                 text,
  telefono_operativo   text,                             -- §5: visible para DGSMH
  telefono_confirmado_en timestamptz,                    -- confirmación al iniciar jornada (§11.1)
  lat                  double precision CHECK (lat BETWEEN -90 AND 90),
  lon                  double precision CHECK (lon BETWEEN -180 AND 180),
  ubicacion_aproximada boolean NOT NULL DEFAULT true,    -- §12.2: ciudad ≠ lugar exacto
  fuente               text,                             -- archivo/URL de origen
  fecha_fuente         date,
  verificacion         text NOT NULL DEFAULT 'pendiente' CHECK (verificacion IN ('confirmado','pendiente')),
  activo               boolean NOT NULL DEFAULT true,
  es_prueba            boolean NOT NULL DEFAULT false,
  creado_en            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recintos (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo               text NOT NULL UNIQUE,
  consulado_id         bigint NOT NULL REFERENCES consulados(id),
  nombre               text NOT NULL,
  direccion            text,
  ciudad               text,
  pais                 text,
  zona_horaria         text,                             -- IANA; NULL = pendiente (§12.2, §18.1)
  zona_horaria_fuente  text,
  lat                  double precision CHECK (lat BETWEEN -90 AND 90),
  lon                  double precision CHECK (lon BETWEEN -180 AND 180),
  ubicacion_aproximada boolean NOT NULL DEFAULT true,
  electores            int CHECK (electores >= 0),       -- solo si figura en el catálogo validado (§11.5)
  fuente               text,
  fecha_fuente         date,
  verificacion         text NOT NULL DEFAULT 'pendiente' CHECK (verificacion IN ('confirmado','pendiente')),
  activo               boolean NOT NULL DEFAULT true,
  es_prueba            boolean NOT NULL DEFAULT false,
  creado_en            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, consulado_id)                               -- permite FK compuesta: imposible un reporte con recinto de otro consulado
);
CREATE INDEX ON recintos (consulado_id);

CREATE TABLE jrv (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo       text NOT NULL UNIQUE,
  recinto_id   bigint NOT NULL,
  consulado_id bigint NOT NULL,
  rotulo       text NOT NULL,                            -- texto legible («JRV 3 Mujeres»…), tal como venga
  sexo         text CHECK (sexo IN ('mujeres','hombres')),
  numero       int,
  electores    int CHECK (electores >= 0),
  activo       boolean NOT NULL DEFAULT true,
  es_prueba    boolean NOT NULL DEFAULT false,
  FOREIGN KEY (recinto_id, consulado_id) REFERENCES recintos(id, consulado_id),
  UNIQUE (id, consulado_id),
  UNIQUE (id, recinto_id)
);
CREATE INDEX ON jrv (recinto_id);

-- Referencia oficial 2026 cargada de insumos/2026/*.csv: valida importaciones, nunca es recinto (§3, guía §2).
CREATE TABLE zonas_referencia_2026 (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  localidad   text NOT NULL,
  pais        text NOT NULL,
  estado      text NOT NULL CHECK (estado IN ('ZONA_CREADA_POR_CNE','CERRADA_RESOLUCION_CNE','SUSPENDIDA_VOTACION_2026')),
  oficina_consular text,
  fecha_fuente date NOT NULL,
  url_fuente  text NOT NULL,
  observacion text,
  UNIQUE (localidad, pais, estado)
);

-- ───────────── Cuentas y sesiones (§2, §16.1) ─────────────
CREATE TABLE usuarios (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo             text NOT NULL CHECK (tipo IN ('consulado','dgsmh','madrid_admin','superadmin')),
  correo           text NOT NULL UNIQUE CHECK (correo = lower(correo)),
  nombre           text NOT NULL,
  password_hash    text NOT NULL,                        -- argon2id
  debe_cambiar     boolean NOT NULL DEFAULT true,        -- C-01
  consulado_id     bigint REFERENCES consulados(id),
  activo           boolean NOT NULL DEFAULT true,
  fallos           int NOT NULL DEFAULT 0,
  bloqueado_hasta  timestamptz,
  mfa_secreto_cifrado   bytea, mfa_nonce bytea,          -- solo superadmin (AES-256-GCM con APP_MASTER_KEY)
  mfa_pendiente_cifrado bytea, mfa_pendiente_nonce bytea,
  mfa_ultimo_contador   bigint,
  es_prueba        boolean NOT NULL DEFAULT false,       -- cuentas creadas por la demo
  creado_en        timestamptz NOT NULL DEFAULT now(),
  ultimo_acceso_en timestamptz,
  CHECK ((tipo = 'consulado') = (consulado_id IS NOT NULL))
);

CREATE TABLE codigos_recuperacion (
  usuario_id bigint NOT NULL REFERENCES usuarios(id),
  hash       bytea NOT NULL,
  usado_en   timestamptz,
  PRIMARY KEY (usuario_id, hash)
);

CREATE TABLE sesiones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash       bytea NOT NULL UNIQUE,                -- sha256 del token de la cookie
  usuario_id       bigint NOT NULL REFERENCES usuarios(id),
  portal           text NOT NULL CHECK (portal IN ('consular','dgsmh','madrid','admin')),
  operador_nombre  text CHECK (char_length(operador_nombre) BETWEEN 2 AND 80),  -- consular: §2 nombre por sesión
  recinto_id       bigint REFERENCES recintos(id),       -- consular: recinto activo (§5)
  mfa_verificada   boolean NOT NULL DEFAULT false,
  creada_en        timestamptz NOT NULL DEFAULT now(),
  expira_en        timestamptz NOT NULL,
  revocada_en      timestamptz,
  ip               inet,
  agente           text
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
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  funcion     text NOT NULL CHECK (funcion IN ('puerta','documentacion','finanzas','mando','documentos_publico')),
  etiqueta    text NOT NULL,                             -- «Puerta 1», «Finanzas 2», «Cartel documentos»
  token_hash  bytea NOT NULL UNIQUE,
  token_cifrado bytea, token_nonce bytea,                -- para volver a mostrar el QR del enlace al admin
  activo      boolean NOT NULL DEFAULT true,
  bloqueado_hasta timestamptz,
  es_prueba   boolean NOT NULL DEFAULT false,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  creado_por  bigint REFERENCES usuarios(id),
  revocado_en timestamptz
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

-- ───────────── Juntas y MJRV de Madrid (§7, «Mapa de juntas de Madrid», §13.2) ─────────────
CREATE TABLE juntas_madrid (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  serie             text NOT NULL CHECK (serie IN ('H','M')),        -- tablero: H1–H41, M1–M54 (§13.5)
  sexo              text NOT NULL CHECK (sexo IN ('hombres','mujeres')),
  numero            int  NOT NULL CHECK (numero > 0),
  zona_color        text NOT NULL CHECK (zona_color IN ('amarillo','azul','rojo','celeste','verde','rosado')),
  orden_cercania    int  NOT NULL,      -- posición del bloque en la cadena física (ver seed); |a-b| = distancia relativa
  rotulo_credencial text,               -- texto grande de la credencial; del Excel si lo trae (P-5). NULL = pendiente
  jrv_id            bigint REFERENCES jrv(id),          -- enlace opcional con el catálogo consular de Madrid
  es_prueba         boolean NOT NULL DEFAULT false,
  UNIQUE (serie, numero)
);
-- db/seed/juntas-madrid.sql: 95 filas DECIDIDAS en la especificación (tabla «Numeración de las fichas»):
--   H1–21 amarillo, H22–41 azul, M1–8 rojo, M9–29 celeste, M30–39 verde, M40–54 rosado.
--   orden_cercania (de «Orden de los bloques»: vial este N→S amarillo, azul, rojo, celeste; vial norte E→O verde, rosado;
--   la esquina NE une amarillo con verde): celeste=1, rojo=2, azul=3, amarillo=4, verde=5, rosado=6. Confirmación en P-11.

CREATE TABLE mjrv (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cedula          text NOT NULL UNIQUE CHECK (cedula ~ '^[0-9A-Z-]{5,20}$'),  -- texto: conserva ceros a la izquierda
  apellidos       text NOT NULL,
  nombres         text NOT NULL,
  cargo_original  text NOT NULL,                                  -- tal cual el Excel (§13.2)
  rol             text NOT NULL CHECK (rol IN ('presidente','secretario','vocal','suplente','otro')),
  junta_origen_id bigint NOT NULL REFERENCES juntas_madrid(id),   -- asignación importada; nunca se sobrescribe (§13.2)
  sexo_persona    text CHECK (sexo_persona IN ('hombre','mujer')),-- solo si el Excel lo trae
  correo          text,
  telefono_e164   text,
  activo          boolean NOT NULL DEFAULT true,                  -- baja administrativa = false → «bloqueado» en puerta
  baja_motivo     text,
  credencial_generada_en timestamptz,                             -- «preparada» (§13.3)
  fuente_archivo  text,
  fila_origen     int,
  es_prueba       boolean NOT NULL DEFAULT false,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON mjrv (junta_origen_id);

-- Envíos de credenciales: preparación, NO actividad de prueba (no se borran al preparar la elección).
CREATE TABLE envios_credencial (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mjrv_id     bigint NOT NULL REFERENCES mjrv(id),
  canal       text NOT NULL CHECK (canal IN ('whatsapp','correo')),
  destino     text NOT NULL,
  estado      text NOT NULL DEFAULT 'en_cola'
              CHECK (estado IN ('en_cola','enviada_al_servicio','fallo','entregada')),  -- §13.3: sin «leído» inventado
  simulado    boolean NOT NULL DEFAULT true,
  id_externo  text,
  error       text,
  creado_por  bigint REFERENCES usuarios(id),
  creado_en   timestamptz NOT NULL DEFAULT now(),
  enviado_en  timestamptz
);
CREATE INDEX ON envios_credencial (mjrv_id);

CREATE TABLE trabajos (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo          text NOT NULL CHECK (tipo IN ('enviar_credencial_whatsapp','enviar_credencial_correo')),
  carga         jsonb NOT NULL,                  -- {"envio_id": n}
  estado        text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_curso','hecho','fallo')),
  intentos      int NOT NULL DEFAULT 0,
  disponible_en timestamptz NOT NULL DEFAULT now(),
  creado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON trabajos (estado, disponible_en);

-- ───────────── Actividad de Madrid (es_prueba según modo) ─────────────
CREATE TABLE lecturas_puerta (                                   -- §7.2, §13.4
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

CREATE TABLE excepciones_disponibilidad (                        -- §7.2, §13.5
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mjrv_id     bigint NOT NULL REFERENCES mjrv(id),
  motivo      text NOT NULL CHECK (char_length(motivo) BETWEEN 2 AND 200),
  activa      boolean NOT NULL DEFAULT true,
  actor_tipo  text NOT NULL CHECK (actor_tipo IN ('operador','madrid_admin')),
  actor_id    bigint NOT NULL,
  actor_nombre text NOT NULL,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  anulada_en  timestamptz,
  es_prueba   boolean NOT NULL DEFAULT cne.en_prueba()
);
CREATE UNIQUE INDEX ON excepciones_disponibilidad (mjrv_id, es_prueba) WHERE activa;

CREATE TABLE decisiones_movimiento (                             -- §7.3, §13.6
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mjrv_id          bigint NOT NULL REFERENCES mjrv(id),
  junta_origen_id  bigint NOT NULL REFERENCES juntas_madrid(id),  -- asignación vigente en el momento de decidir
  junta_destino_id bigint NOT NULL REFERENCES juntas_madrid(id),
  decision         text NOT NULL CHECK (decision IN ('aceptada','pasada','no_viable')),
  motivo           text,          -- obligatorio en no_viable: 'sin_respuesta' | 'negativa' | 'ausente' | texto
  manual           boolean NOT NULL DEFAULT false,               -- movimiento elegido a mano por el centro de mando
  actor_tipo       text NOT NULL CHECK (actor_tipo IN ('operador','madrid_admin')),
  actor_id         bigint NOT NULL,
  actor_nombre     text NOT NULL,
  creado_en        timestamptz NOT NULL DEFAULT now(),
  es_prueba        boolean NOT NULL DEFAULT cne.en_prueba(),
  CHECK (junta_origen_id <> junta_destino_id),
  CHECK (decision <> 'no_viable' OR motivo IS NOT NULL)
);
CREATE INDEX ON decisiones_movimiento (mjrv_id, creado_en DESC);

CREATE TABLE documentos_mjrv (                                   -- §7.4, §13.7
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mjrv_id       bigint NOT NULL REFERENCES mjrv(id),
  lado          text NOT NULL CHECK (lado IN ('anverso','reverso')),
  imagen_cifrada bytea NOT NULL,          -- JPEG re-codificado con sharp (sin EXIF) y cifrado AES-256-GCM
  nonce         bytea NOT NULL,
  bytes         int NOT NULL CHECK (bytes BETWEEN 20000 AND 2000000),
  ancho         int NOT NULL, alto int NOT NULL,
  sha256        bytea NOT NULL,           -- de la imagen en claro: impide dos fotos idénticas (§13.7)
  origen        text NOT NULL CHECK (origen IN ('publico','estacion')),
  operador_id   bigint REFERENCES operadores_madrid(id),
  creado_en     timestamptz NOT NULL DEFAULT now(),
  es_prueba     boolean NOT NULL DEFAULT cne.en_prueba(),
  UNIQUE (mjrv_id, lado, es_prueba)       -- repetir una foto la sustituye (UPSERT)
);

CREATE TABLE atenciones_finanzas (                               -- aviso NO bloqueante (P-8)
  mjrv_id     bigint NOT NULL REFERENCES mjrv(id),
  operador_id bigint NOT NULL REFERENCES operadores_madrid(id),
  desde       timestamptz NOT NULL DEFAULT now(),
  es_prueba   boolean NOT NULL DEFAULT cne.en_prueba(),
  PRIMARY KEY (mjrv_id, es_prueba)
);

CREATE TABLE actas_pago (                                        -- §13.8: generar/imprimir ≠ pagar
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

CREATE TABLE pagos_confirmados (                                 -- §7.5 REQUISITO DE CONTROL
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mjrv_id       bigint NOT NULL REFERENCES mjrv(id),
  acta_id       bigint NOT NULL REFERENCES actas_pago(id),
  importe_usd   numeric(12,2) NOT NULL,
  tipo_cambio   numeric(14,6) NOT NULL,
  importe_eur   numeric(12,2) NOT NULL,   -- euros efectivamente entregados (§15.6)
  funciones_verificadas boolean NOT NULL CHECK (funciones_verificadas),  -- verificación directa de finanzas (§7.5)
  operador_id   bigint NOT NULL REFERENCES operadores_madrid(id),
  enlace_id     bigint NOT NULL REFERENCES enlaces_estacion(id),
  confirmado_en timestamptz NOT NULL DEFAULT now(),
  es_prueba     boolean NOT NULL DEFAULT cne.en_prueba(),
  UNIQUE (mjrv_id, es_prueba)              -- dos puestos a la vez: solo uno inserta (F-06)
);

-- ───────────── Actividad consular (§5, §6, §11, §15) ─────────────
CREATE TABLE reportes_hito (                                     -- estado vigente por JRV/hito
  jrv_id          bigint NOT NULL,
  hito            text NOT NULL CHECK (hito IN ('inicio','cierre_votacion','inicio_escrutinio','fin_escrutinio',
                                                 'inicio_escaneo','fin_escaneo','cierre_proceso')),
  consulado_id    bigint NOT NULL,
  recinto_id      bigint NOT NULL,
  estado          text NOT NULL CHECK (estado IN ('completada','pendiente','sin_informacion')),  -- sin_informacion = corrección que retira el dato
  operador_nombre text NOT NULL,
  sesion_id       uuid NOT NULL REFERENCES sesiones(id),
  client_id       uuid NOT NULL,
  hora_dispositivo timestamptz,
  recibido_en     timestamptz NOT NULL DEFAULT now(),
  es_prueba       boolean NOT NULL DEFAULT cne.en_prueba(),
  PRIMARY KEY (jrv_id, hito, es_prueba),
  FOREIGN KEY (jrv_id, consulado_id) REFERENCES jrv(id, consulado_id),
  FOREIGN KEY (jrv_id, recinto_id)   REFERENCES jrv(id, recinto_id)
);
CREATE INDEX ON reportes_hito (recinto_id);

CREATE TABLE reportes_hito_historial (                           -- §11.3 registro técnico (valor previo y nuevo)
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jrv_id          bigint NOT NULL, hito text NOT NULL,
  consulado_id    bigint NOT NULL, recinto_id bigint NOT NULL,
  estado_anterior text, estado_nuevo text NOT NULL,
  operador_nombre text NOT NULL, sesion_id uuid NOT NULL, client_id uuid NOT NULL,
  recibido_en     timestamptz NOT NULL DEFAULT now(),
  es_prueba       boolean NOT NULL DEFAULT cne.en_prueba()
);

CREATE TABLE votantes (                                          -- §11.5: cifra vigente por recinto
  recinto_id      bigint NOT NULL,
  consulado_id    bigint NOT NULL,
  cantidad        int NOT NULL CHECK (cantidad >= 0),
  metodo          text NOT NULL CHECK (metodo IN ('firmas','estimacion')),
  operador_nombre text NOT NULL, sesion_id uuid NOT NULL, client_id uuid NOT NULL,
  recibido_en     timestamptz NOT NULL DEFAULT now(),
  es_prueba       boolean NOT NULL DEFAULT cne.en_prueba(),
  PRIMARY KEY (recinto_id, es_prueba),
  FOREIGN KEY (recinto_id, consulado_id) REFERENCES recintos(id, consulado_id)
);
CREATE TABLE votantes_historial (                              -- cada cambio de la cifra vigente
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recinto_id      bigint NOT NULL, consulado_id bigint NOT NULL,
  cantidad_anterior int, metodo_anterior text,
  cantidad        int NOT NULL, metodo text NOT NULL,
  operador_nombre text NOT NULL, sesion_id uuid NOT NULL, client_id uuid NOT NULL,
  recibido_en     timestamptz NOT NULL DEFAULT now(),
  es_prueba       boolean NOT NULL DEFAULT cne.en_prueba()
);

CREATE TABLE sin_novedades (                                     -- §5, §11.5: no toca juntas ni incidencias
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recinto_id      bigint NOT NULL, consulado_id bigint NOT NULL,
  fase            text NOT NULL CHECK (fase IN ('instalacion','sufragio','escrutinio','escaneo','cierre')),
  operador_nombre text NOT NULL, sesion_id uuid NOT NULL, client_id uuid NOT NULL UNIQUE,
  recibido_en     timestamptz NOT NULL DEFAULT now(),
  es_prueba       boolean NOT NULL DEFAULT cne.en_prueba(),
  FOREIGN KEY (recinto_id, consulado_id) REFERENCES recintos(id, consulado_id)
);

-- Catálogo de incidencias: VACÍO hasta que Pablo lo aporte (§6 ABIERTO, P-15). «Otro» siempre disponible en código.
CREATE TABLE tipos_incidencia (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fase               text NOT NULL CHECK (fase IN ('instalacion','sufragio','escrutinio','escaneo','cierre')),
  nombre             text NOT NULL,
  prioridad_sugerida text NOT NULL DEFAULT 'normal' CHECK (prioridad_sugerida IN ('normal','alta','critica')),
  alcance_sugerido   text NOT NULL DEFAULT 'recinto' CHECK (alcance_sugerido IN ('recinto','jrv')),
  orden              int NOT NULL DEFAULT 0,
  activo             boolean NOT NULL DEFAULT true,
  fuente             text,
  es_prueba          boolean NOT NULL DEFAULT false,
  UNIQUE (fase, nombre)
);

CREATE TABLE incidencias (                                       -- §6, §11.6, §12.5
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,   -- se muestra «INC-0042»
  consulado_id      bigint NOT NULL,
  recinto_id        bigint NOT NULL,
  fase              text NOT NULL CHECK (fase IN ('instalacion','sufragio','escrutinio','escaneo','cierre')),
  tipo_id           bigint REFERENCES tipos_incidencia(id),           -- NULL = «Otro»
  descripcion       text CHECK (char_length(descripcion) <= 1000),    -- obligatoria si tipo_id IS NULL (validación en servidor)
  prioridad         text NOT NULL CHECK (prioridad IN ('normal','alta','critica')),
  afecta_recinto    boolean NOT NULL,                                 -- true = recinto entero; false = JRV en incidencia_jrv
  estado            text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','parcial','cerrada')),
  seguimiento_dgsmh boolean NOT NULL DEFAULT false,                   -- §6: Quito marca para seguimiento
  creada_por_nombre text NOT NULL,
  sesion_id         uuid NOT NULL REFERENCES sesiones(id),
  client_id         uuid NOT NULL UNIQUE,                             -- doble clic / reenvío (§15.2)
  creado_en         timestamptz NOT NULL DEFAULT now(),
  actualizado_en    timestamptz NOT NULL DEFAULT now(),
  es_prueba         boolean NOT NULL DEFAULT cne.en_prueba(),
  FOREIGN KEY (recinto_id, consulado_id) REFERENCES recintos(id, consulado_id),
  UNIQUE (id, consulado_id)
);
CREATE INDEX ON incidencias (estado);

CREATE TABLE incidencia_jrv (
  incidencia_id bigint NOT NULL,
  consulado_id  bigint NOT NULL,
  jrv_id        bigint NOT NULL,
  resuelta      boolean NOT NULL DEFAULT false,                       -- resolución parcial (§6)
  es_prueba     boolean NOT NULL DEFAULT cne.en_prueba(),
  PRIMARY KEY (incidencia_id, jrv_id),
  FOREIGN KEY (incidencia_id, consulado_id) REFERENCES incidencias(id, consulado_id),
  FOREIGN KEY (jrv_id, consulado_id) REFERENCES jrv(id, consulado_id)
);

CREATE TABLE actuaciones_incidencia (                            -- historial inalterable (§12.5, §15.3)
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incidencia_id   bigint NOT NULL,
  consulado_id    bigint NOT NULL,
  tipo            text NOT NULL CHECK (tipo IN ('apertura','cambio','apoyo_solicitado','apoyo_recibido',
                                                'seguimiento','nota','resolucion_parcial','cierre','reapertura')),
  texto           text CHECK (char_length(texto) <= 1000),      -- obligatorio en resolucion_parcial y cierre
  jrv_ids         bigint[],                                     -- JRV resueltas en una resolución parcial
  actor_portal    text NOT NULL CHECK (actor_portal IN ('consular','dgsmh')),
  actor_usuario_id bigint NOT NULL REFERENCES usuarios(id),
  actor_nombre    text NOT NULL,                                -- operador declarado o nombre del funcionario DGSMH
  creado_en       timestamptz NOT NULL DEFAULT now(),
  es_prueba       boolean NOT NULL DEFAULT cne.en_prueba(),
  FOREIGN KEY (incidencia_id, consulado_id) REFERENCES incidencias(id, consulado_id),
  CHECK (tipo NOT IN ('resolucion_parcial','cierre') OR char_length(coalesce(texto,'')) >= 3)
);
CREATE INDEX ON actuaciones_incidencia (incidencia_id, creado_en);

CREATE TABLE solicitudes_apoyo (                                 -- §6, §12.4
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  incidencia_id    bigint NOT NULL,
  consulado_id     bigint NOT NULL,
  urgente          boolean NOT NULL,                            -- solo urgente suena en Quito
  estado           text NOT NULL DEFAULT 'emitida' CHECK (estado IN ('emitida','recibida','resuelta')),
  creada_por_nombre text NOT NULL,
  creada_en        timestamptz NOT NULL DEFAULT now(),
  recibida_en      timestamptz,
  recibida_por     bigint REFERENCES usuarios(id),
  resuelta_en      timestamptz,
  es_prueba        boolean NOT NULL DEFAULT cne.en_prueba(),
  FOREIGN KEY (incidencia_id, consulado_id) REFERENCES incidencias(id, consulado_id)
);
CREATE INDEX ON solicitudes_apoyo (estado) WHERE estado = 'emitida';

-- Idempotencia de envíos consulares (borradores reenviados, §11.7, C-16)
CREATE TABLE operaciones_recibidas (
  client_id    uuid PRIMARY KEY,
  consulado_id bigint NOT NULL REFERENCES consulados(id),
  ruta         text NOT NULL,
  resultado    jsonb NOT NULL,
  recibido_en  timestamptz NOT NULL DEFAULT now(),
  es_prueba    boolean NOT NULL DEFAULT cne.en_prueba()
);

-- ───────────── Trazabilidad y limpieza ─────────────
CREATE TABLE auditoria (                                         -- §16.3: sin PIN, contraseñas ni imágenes
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portal      text NOT NULL,
  actor_tipo  text NOT NULL,     -- usuario, operador, publico, sistema
  actor_id    bigint,
  actor_nombre text,
  accion      text NOT NULL,     -- 'login_fallido', 'importacion_catalogo', 'acta_generada', 'modo_cambiado'…
  entidad     text, entidad_id text,
  datos       jsonb NOT NULL DEFAULT '{}',
  ip          inet,
  creado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON auditoria (creado_en DESC);

CREATE TABLE respaldo_limpieza (                                 -- §14.3: respaldo comprobable previo al borrado
  lote      uuid NOT NULL,
  tabla     text NOT NULL,
  fila      jsonb NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
```

## 3. Vistas (siempre `security_invoker`, para que apliquen RLS)

```sql
CREATE VIEW v_hitos AS SELECT * FROM (VALUES ('inicio',1),('cierre_votacion',2),('inicio_escrutinio',3),
  ('fin_escrutinio',4),('inicio_escaneo',5),('fin_escaneo',6),('cierre_proceso',7)) AS t(hito, orden);

-- Avance por recinto y hito (§11.3, §15.6). Denominador = JRV activas del catálogo.
CREATE VIEW v_avance_recinto WITH (security_invoker = true) AS
SELECT r.id AS recinto_id, r.consulado_id, h.hito, h.orden,
       count(j.id)                                           AS total,
       count(rh.jrv_id) FILTER (WHERE rh.estado = 'completada') AS completadas,
       count(rh.jrv_id) FILTER (WHERE rh.estado = 'pendiente')  AS pendientes,
       count(j.id) - count(rh.jrv_id) FILTER (WHERE rh.estado IN ('completada','pendiente')) AS sin_informacion,
       max(rh.recibido_en)                                   AS ultima_actividad
FROM recintos r
JOIN jrv j ON j.recinto_id = r.id AND j.activo
CROSS JOIN v_hitos h
LEFT JOIN reportes_hito rh ON rh.jrv_id = j.id AND rh.hito = h.hito
WHERE r.activo
GROUP BY r.id, r.consulado_id, h.hito, h.orden;
-- Consulado y mundo: SUMA de total y completadas de esta vista; nunca promedio de porcentajes (Q-06).

-- Asignación operativa vigente en Madrid (§13.2: origen ≠ destino vigente; se recalcula, nunca se sobrescribe mjrv)
CREATE VIEW v_mjrv_asignacion WITH (security_invoker = true) AS
SELECT m.id AS mjrv_id, m.junta_origen_id,
       coalesce((SELECT d.junta_destino_id FROM decisiones_movimiento d
                 WHERE d.mjrv_id = m.id AND d.decision = 'aceptada'
                 ORDER BY d.creado_en DESC, d.id DESC LIMIT 1), m.junta_origen_id) AS junta_actual_id,
       EXISTS (SELECT 1 FROM lecturas_puerta l WHERE l.mjrv_id = m.id AND l.resultado = 'valido') AS ingresado,
       EXISTS (SELECT 1 FROM excepciones_disponibilidad e WHERE e.mjrv_id = m.id AND e.activa) AS con_excepcion
FROM mjrv m WHERE m.activo;
-- disponible = ingresado AND NOT con_excepcion (§7.2: presente y disponible por defecto)
```

## 4. RLS y permisos

```sql
-- Permisos base de cne_app
GRANT USAGE ON SCHEMA cne TO cne_app;
GRANT SELECT ON ALL TABLES IN SCHEMA cne TO cne_app;
REVOKE ALL ON respaldo_limpieza FROM cne_app;
GRANT INSERT, UPDATE ON usuarios, codigos_recuperacion, sesiones, intentos_acceso, sesiones_estacion,
  operadores_madrid, enlaces_estacion, mjrv, juntas_madrid, consulados, envios_credencial, trabajos, auditoria,
  configuracion, parametros_pago TO cne_app;
GRANT INSERT, UPDATE ON lecturas_puerta, excepciones_disponibilidad, decisiones_movimiento, documentos_mjrv,
  atenciones_finanzas, actas_pago, pagos_confirmados, reportes_hito, reportes_hito_historial, votantes,
  votantes_historial, sin_novedades, incidencias, incidencia_jrv, actuaciones_incidencia, solicitudes_apoyo,
  operaciones_recibidas TO cne_app;
GRANT DELETE ON atenciones_finanzas TO cne_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA cne TO cne_app;
-- La superadmin importa catálogo (consulados/recintos/jrv/tipos_incidencia) con DATABASE_ADMIN_URL (cne_owner).

-- Catálogo: el consulado solo ve lo suyo (C-04); Quito, superadmin, Madrid y trabajador leen todo.
ALTER TABLE consulados ENABLE ROW LEVEL SECURITY;
CREATE POLICY leer ON consulados FOR SELECT USING (
  portal() IN ('dgsmh','admin','madrid','worker') OR (portal() = 'consular' AND id = consulado_actual()));
CREATE POLICY telefono ON consulados FOR UPDATE
  USING (portal() = 'consular' AND id = consulado_actual())
  WITH CHECK (portal() = 'consular' AND id = consulado_actual());

-- Madrid: juntas sin datos personales (la superadmin puede verlas); solo Madrid las actualiza (rótulo, enlace a JRV).
ALTER TABLE juntas_madrid ENABLE ROW LEVEL SECURITY;
CREATE POLICY leer ON juntas_madrid FOR SELECT USING (portal() IN ('madrid','worker','admin'));
CREATE POLICY escribir ON juntas_madrid FOR UPDATE USING (portal() = 'madrid') WITH CHECK (portal() = 'madrid');

DO $$
DECLARE t text;
  propio text := $c$(portal() = 'consular' AND consulado_id = consulado_actual())$c$;
BEGIN
  -- Catálogo con consulado_id
  FOREACH t IN ARRAY ARRAY['recintos','jrv'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY leer ON %I FOR SELECT USING (portal() IN (''dgsmh'',''admin'',''madrid'',''worker'') OR %s)', t, propio);
  END LOOP;

  -- Actividad consular que solo escribe el consulado (Quito y superadmin leen)
  FOREACH t IN ARRAY ARRAY['reportes_hito','reportes_hito_historial','votantes','votantes_historial',
                           'sin_novedades','operaciones_recibidas'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY leer ON %I FOR SELECT USING (es_prueba = en_prueba() AND (portal() IN (''dgsmh'',''admin'') OR %s))', t, propio);
    EXECUTE format('CREATE POLICY crear ON %I FOR INSERT WITH CHECK (es_prueba = en_prueba() AND %s)', t, propio);
    EXECUTE format('CREATE POLICY corregir ON %I FOR UPDATE USING (es_prueba = en_prueba() AND %s) WITH CHECK (es_prueba = en_prueba() AND %s)', t, propio, propio);
  END LOOP;

  -- Incidencias: escriben el consulado (lo suyo) y Quito (todo)
  FOREACH t IN ARRAY ARRAY['incidencias','incidencia_jrv','actuaciones_incidencia','solicitudes_apoyo'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY leer ON %I FOR SELECT USING (es_prueba = en_prueba() AND (portal() IN (''dgsmh'',''admin'') OR %s))', t, propio);
    EXECUTE format('CREATE POLICY crear ON %I FOR INSERT WITH CHECK (es_prueba = en_prueba() AND (portal() = ''dgsmh'' OR %s))', t, propio);
    EXECUTE format('CREATE POLICY actualizar ON %I FOR UPDATE USING (es_prueba = en_prueba() AND (portal() = ''dgsmh'' OR %s)) WITH CHECK (es_prueba = en_prueba() AND (portal() = ''dgsmh'' OR %s))', t, propio, propio);
  END LOOP;

  -- Actividad de Madrid: solo el portal madrid (admin y estaciones). Quito y superadmin, nunca (§12.6, §14.1).
  FOREACH t IN ARRAY ARRAY['lecturas_puerta','excepciones_disponibilidad','decisiones_movimiento','documentos_mjrv',
                           'atenciones_finanzas','actas_pago','pagos_confirmados'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY madrid ON %I FOR ALL USING (es_prueba = en_prueba() AND portal() = ''madrid'') WITH CHECK (es_prueba = en_prueba() AND portal() = ''madrid'')', t);
  END LOOP;

  -- Maestros y preparación de Madrid: portal madrid y trabajador (envíos)
  FOREACH t IN ARRAY ARRAY['mjrv','operadores_madrid','enlaces_estacion','sesiones_estacion','envios_credencial','trabajos'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY madrid ON %I FOR ALL USING (portal() IN (''madrid'',''worker'')) WITH CHECK (portal() IN (''madrid'',''worker''))', t);
  END LOOP;
END $$;

-- El portal 'publico' (formulario del QR genérico) NO tiene políticas: usa solo dos funciones SECURITY DEFINER
-- (dueño cne_owner, SET search_path = cne, public), que empiezan comprobando portal() = 'publico':
--   cne.mjrv_para_documentos(cedula text) → (mjrv_id, iniciales «J. P.», rotulo_junta, tiene_anverso, tiene_reverso)
--   cne.guardar_documento(mjrv_id, lado, imagen_cifrada, nonce, bytes, ancho, alto, sha256) → UPSERT en documentos_mjrv
-- La portada de la superadmin obtiene recuentos de Madrid con cne.recuentos_madrid() (SECURITY DEFINER, solo números).
-- Minimización (§16.2): ninguna devuelve nombres completos, cédulas ajenas ni imágenes.
```

Notas:
- `usuarios`, `sesiones`, `intentos_acceso`, `configuracion`, `auditoria`: sin RLS (el acceso es anterior a conocer el portal); el código solo los toca desde `src/server/auth.ts`, `estacion.ts` y `auditoria.ts`.
- El dueño (`cne_owner`) no está sujeto a RLS: lo usan solo migraciones, importaciones de la superadmin y la limpieza.
- `atenciones_finanzas` caduca a los 10 min por consulta (`desde > now() - interval '10 minutes'`), sin trabajo programado.

## 5. Operaciones críticas (SQL de referencia para el programador)

**Ingreso en puerta (idempotente, §13.4):**
```sql
-- dentro de withPortal('madrid'); $1 = cédula leída normalizada
WITH m AS (SELECT id, activo FROM mjrv WHERE cedula = $1)
INSERT INTO lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id, dispositivo)
SELECT $1, m.id, CASE WHEN m.activo THEN 'valido' ELSE 'bloqueado' END, $2, $3, $4 FROM m
ON CONFLICT (mjrv_id, es_prueba) WHERE resultado = 'valido' DO NOTHING
RETURNING resultado;
-- Sin fila devuelta: si existe m → insertar 'duplicado'; si no existe m → insertar 'desconocido' (mjrv_id NULL).
```

**Confirmar pago (atómico, §7.5, F-06):**
```sql
BEGIN;  -- withPortal('madrid'), sesión de estación con función 'finanzas'
SELECT 1 FROM mjrv WHERE id = $1 AND activo FOR UPDATE;                    -- serializa estaciones sobre la misma ficha
-- comprobar: 2 documentos (anverso y reverso), acta $2 de esta persona existe, parámetros completos
INSERT INTO pagos_confirmados (mjrv_id, acta_id, importe_usd, tipo_cambio, importe_eur, funciones_verificadas, operador_id, enlace_id)
SELECT $1, a.id, a.importe_usd, a.tipo_cambio, a.importe_eur, true, $3, $4 FROM actas_pago a WHERE a.id = $2 AND a.mjrv_id = $1
ON CONFLICT (mjrv_id, es_prueba) DO NOTHING
RETURNING id;
-- Sin fila: «Ya pagado» + datos del pago previo (F-07). Con fila: borrar atenciones_finanzas de la persona.
COMMIT;
```

**Reporte de hito (último recibido gana, §5):**
```sql
INSERT INTO reportes_hito (jrv_id, hito, consulado_id, recinto_id, estado, operador_nombre, sesion_id, client_id, hora_dispositivo)
VALUES (...)
ON CONFLICT (jrv_id, hito, es_prueba) DO UPDATE SET estado = EXCLUDED.estado, operador_nombre = EXCLUDED.operador_nombre,
  sesion_id = EXCLUDED.sesion_id, client_id = EXCLUDED.client_id, hora_dispositivo = EXCLUDED.hora_dispositivo, recibido_en = now()
RETURNING (xmax = 0) AS nuevo;
-- + fila en reportes_hito_historial con estado_anterior leído antes con FOR UPDATE.
```

## 6. Estados (§15.4) y dónde viven

| Subsistema | Estados | Implementación |
| --- | --- | --- |
| JRV por hito | completada / pendiente / sin información | `reportes_hito.estado`; sin fila o `sin_informacion` = sin información |
| Reporte local | borrador / enviando / aceptado / error | Cliente (`localStorage`) + respuesta del servidor |
| Incidencia | abierta / parcial / cerrada / reabierta | `incidencias.estado` + actuaciones `reapertura` (mismo id) |
| Solicitud urgente | emitida / recibida / resuelta | `solicitudes_apoyo.estado` |
| Alerta de ausencia | detectada / regularizada | Calculada al consultar (no se guarda): hito esperado no completado tras hora local + margen |
| Llegada Madrid | no registrada / válido / duplicado o rechazo | `lecturas_puerta` |
| Junta Madrid | rojo 0 / ámbar 1–2 / verde ≥3 + marca de movimiento | Calculada de `v_mjrv_asignacion` + `decisiones_movimiento` |
| Documento | falta anverso y/o reverso / completo | Recuento en `documentos_mjrv` |
| Pago | documentación incompleta / listo / acta preparada / confirmado | Calculado: documentos + `actas_pago` + `pagos_confirmados` |
| Sistema | prueba / elección | `configuracion.modo` |

## 7. Trazabilidad entidad → especificación (§15.1)

| Entidad §15.1 | Tabla(s) |
| --- | --- |
| Consulado, Recinto, JRV | `consulados`, `recintos`, `jrv` |
| Operador consular | `sesiones.operador_nombre` (sin cuenta personal) |
| Reporte de hito | `reportes_hito` + `reportes_hito_historial` |
| Reporte de participación | `votantes` + `votantes_historial` |
| Confirmación sin novedades | `sin_novedades` |
| Incidencia, Actuación, Solicitud de apoyo | `incidencias`, `incidencia_jrv`, `actuaciones_incidencia`, `solicitudes_apoyo` |
| Alerta por falta de reporte | cálculo en `src/domain/alertas.ts` con `configuracion.margen_alerta_min` |
| MJRV, Credencial | `mjrv`, `juntas_madrid.rotulo_credencial`, `envios_credencial` |
| Ingreso Madrid | `lecturas_puerta` |
| Movimiento Madrid | `decisiones_movimiento`, `v_mjrv_asignacion` |
| Documento MJRV | `documentos_mjrv` |
| Trámite de pago / Confirmación | `actas_pago` / `pagos_confirmados` |
| Registro de prueba | columna `es_prueba` + `respaldo_limpieza` |

## 8. Importaciones (formato propio mientras no llegue el real)

Cada importador: lee Excel/CSV → normaliza → **vista previa** con errores (bloquean) y advertencias (no bloquean) por fila → «Aplicar» en una transacción → informe descargable. El mapeo de columnas vive en un único objeto por importador (`src/domain/importacion/<tipo>.ts`) para adaptarlo al archivo real sin tocar la lógica. Plantillas descargables en `public/plantillas/`.

| Importador | Columnas mínimas | Errores | Advertencias |
| --- | --- | --- | --- |
| Catálogo consular (superadmin) | Hojas `consulados` (codigo, nombre, ciudad, pais, telefono_operativo, lat, lon, fuente, fecha_fuente), `recintos` (codigo, consulado_codigo, nombre, direccion, ciudad, pais, zona_horaria, lat, lon, electores, fuente, fecha_fuente), `jrv` (codigo, recinto_codigo, rotulo, sexo, numero, electores) | código repetido; referencia a consulado/recinto inexistente; zona horaria IANA inválida; número negativo | recinto sin zona horaria o sin coordenadas; recinto cuya ciudad coincide con zona CERRADA o SUSPENDIDA de `zonas_referencia_2026`; recinto sin JRV; suma de electores de JRV ≠ electores del recinto |
| Cuentas consulares (superadmin) | consulado_codigo, correo, contrasena_temporal | correo inválido o repetido; consulado inexistente; contraseña < 8 | consulado sin cuenta |
| MJRV Madrid (admin Madrid) | cedula, apellidos, nombres, cargo, serie (H/M o la del archivo), junta (número), correo, telefono, [rotulo], [sexo] | cédula repetida en archivo o con otra persona en base; junta inexistente; apellidos/nombres vacíos | cédula de 9 dígitos (se rellena con 0 a la izquierda: Excel pierde el cero); dígito verificador ecuatoriano no cuadra (no se rechaza, §16.5); cargo no reconocido → rol `otro`; junta con > 1 presidente; junta con < 3 titulares; teléfono no interpretable (libphonenumber, región ES) |
| Tipos de incidencia (superadmin) | fase, nombre, prioridad_sugerida, alcance_sugerido | fase o prioridad no válida | — |

Una reimportación **actualiza por clave** (`codigo` o `cedula`) y nunca borra filas con actividad: las ausentes del archivo se listan para «dar de baja» (activo = false) con confirmación.
