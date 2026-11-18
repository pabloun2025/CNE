# 09 · Cambios por las decisiones de Pablo del 18-11-2026 (D01–D14)

**Estado:** 18-11-2026. Parte de lo publicado en https://madrid.consulado.app (M01–M25 salvo M24, `main`). Prevalece sobre 07 y 08 en lo que toque. Las decisiones están registradas en `ESPECIFICACION_FUNCIONAL.md` como «DECIDIDO (18-11-2026)».
**Reglas de este plan:** la base de producción ya tiene datos → migraciones **aditivas e idempotentes** (no se borra ni renombra ninguna columna; se deja de usar). Un commit por tarea («D0n · …»). Antes de cerrar cada tarea: `npx tsc --noEmit -p .`, `npm run lint`, `npm test`, `npm run build` y revisión a 375 px. Toda ruta API o acción nueva entra en `tests/permisos.test.ts` (M25) o la prueba falla. Envíos reales: **nunca** en pruebas ni en local (proveedores simulados o `fetch` falso).

---

## 1. Decisiones y su traducción técnica

| # | Decisión (18-11-2026) | Qué cambia en el sistema | Tarea |
| --- | --- | --- | --- |
| 1 | Importe **fijo en EUR**; fuera USD y tipo de cambio. En documentos para el público el acta se llama también «comprobante de pago». | `parametros_pago.importe_eur` (nueva); el cálculo, el formulario, el acta, el panel y el informe dejan de usar `importe_usd`, `tipo_cambio`, `sentido_cambio`, `decimales_eur`, `redondeo` (columnas conservadas, sin uso). `actas_pago`/`pagos_confirmados`: `importe_usd` y `tipo_cambio` pasan a admitir NULL. | D01, D03 |
| 2 | Acta: modelo provisional, sin cambios de formato. | Solo se quitan las dos líneas de USD/cambio y se añade el subtítulo «Comprobante de pago». | D03 |
| 3 | Rótulo de credencial = el que traiga el Excel. | **Verificado en el código:** el importador ya toma la columna `rotulo`/`rotulo credencial` (`src/domain/importacion/mjrv.ts`, `MAPEO_COLUMNAS.rotulo`) y la guarda tal cual en `mjrv.rotulo_credencial`. **Ajuste necesario:** si el Excel no trae esa columna, hoy todas las credenciales quedan «pendientes»; y un Excel con la nomenclatura M01/F01 del modelo de credencial se leería mal (M01 → Mujeres 1). | D02 |
| 4 | WhatsApp real con la Evolution API existente, **instancia propia de CNE** vinculada desde Madrid; correo real por Brevo; interruptor de la superadmin; cola con pausas al azar. | Variables copiadas por `deploy-oracle.sh` sin imprimirlas; pantalla de línea en **superadmin**; cola en `envios_credencial` procesada por un temporizador dentro del propio contenedor `cne-app` (sin trabajador). | D05–D08 |
| 5 | Reingreso en puerta → **AMARILLO** con la hora del primer ingreso y botón «Dejar pasar» (registrado, no cuenta dos veces). Rojo solo desconocida o dada de baja. | Nuevo resultado `reingreso_autorizado` en `lecturas_puerta`; la lectura `duplicado` se muestra en amarillo. | D01, D04 |
| 6 | Bloqueada = dada de baja. | Ya es así (`mjrv.activo = false` → `bloqueado`). Solo cambia el texto. | D04 |
| 7 | Traslado cuenta al aceptarlo. | Sin cambio. | — |
| 8 | «No viable»: fuera de las propuestas hasta reactivarla. | Sin cambio (`rehabilitada_en`, migración 2026-11-17). | — |
| 9 | **Incorporar votantes como MJRV** (centro de mando, uno a uno) y **tres cargos siempre cubiertos** por junta. | Tabla `asignaciones_cargo`; función pura `cubrirCargos`; verde = 3 cargos cubiertos; propuestas y traslados asignan cargo; formulario de incorporación. | D01, D09–D11 |
| 10a | Orden de zonas deducido del plano. | Ya es el del seed (`orden_cercania`: celeste 1, rojo 2, azul 3, amarillo 4, verde 5, rosado 6 = vial este de sur a norte y, tras la esquina, vial norte de este a oeste). Solo se cierra P-11 en comentarios y documentos. | D14 |
| 10b | QR de documentos por cartel **y** enlace en el mensaje de la credencial. | El cartel ya existe (M13). El texto del mensaje lleva `https://<HOST_MADRID>/d`. | D08 |
| 10c | Aviso **no bloqueante** en finanzas si otro puesto tiene abierta la misma ficha. | Tabla `fichas_abiertas_finanzas` (5 min). Sustituye M24/P-8. | D01, D12 |
| 10d | Fotos de cédula conservadas hasta que la superadmin las borre con un botón (confirmación escrita y auditoría). | Acción en superadmin con frase `BORRAR FOTOS`, con el dueño del esquema. | D13 |

Validación de cédula ecuatoriana (decisión 9): **el sistema no la hace hoy** (solo formato `^[0-9A-Z-]{5,20}$` y unicidad). Como la decisión dice «si el sistema ya lo hace», no se añade dígito verificador; sí se rechazan duplicados (índice único existente en `mjrv.cedula`).

---

## 2. Modelo de datos (una migración: `db/migrations/2026-11-19-decisiones-18-11.sql`)

Se escribe entera en D01 para que las tareas siguientes no toquen el esquema. La versión anterior del código ignora todo lo nuevo (revertir con `cne:anterior` sigue sin restaurar la base).

```sql
-- D01 · Decisiones de Pablo del 18-11-2026 (docs/diseno/09). Aditiva e idempotente.

-- 1. Importe fijo en EUR. Las columnas de USD y cambio se conservan sin uso.
ALTER TABLE cne.parametros_pago ADD COLUMN IF NOT EXISTS importe_eur numeric(12,2) CHECK (importe_eur > 0);
ALTER TABLE cne.actas_pago        ALTER COLUMN importe_usd DROP NOT NULL, ALTER COLUMN tipo_cambio DROP NOT NULL;
ALTER TABLE cne.pagos_confirmados ALTER COLUMN importe_usd DROP NOT NULL, ALTER COLUMN tipo_cambio DROP NOT NULL;

-- 5. Puerta: «Dejar pasar» un reingreso. Es un superconjunto del CHECK anterior (verificar el nombre con \d cne.lecturas_puerta).
ALTER TABLE cne.lecturas_puerta DROP CONSTRAINT IF EXISTS lecturas_puerta_resultado_check;
ALTER TABLE cne.lecturas_puerta ADD CONSTRAINT lecturas_puerta_resultado_check
  CHECK (resultado IN ('valido','desconocido','duplicado','bloqueado','reingreso_autorizado'));

-- 9. Votantes incorporados como MJRV (presentes desde que se incorporan).
ALTER TABLE cne.mjrv ADD COLUMN IF NOT EXISTS incorporado_en  timestamptz;
ALTER TABLE cne.mjrv ADD COLUMN IF NOT EXISTS incorporado_por text;          -- nombre del actor; el detalle va en auditoria

-- 9. Cargo asumido por un sustituto (trasladado, incorporado o asignación manual). El titular y el suplente
--    de la propia junta no necesitan fila: se deducen (src/domain/cargos.ts).
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

-- RLS de modo en las dos tablas nuevas de actividad (como en schema.sql).
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
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS whatsapp_numero          text;        -- número vinculado (solo informativo)
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS correo_remitente         text;
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS correo_remitente_nombre  text;
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS whatsapp_proximo_en      timestamptz; -- ritmo: siguiente envío permitido
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS correo_proximo_en        timestamptz;
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS whatsapp_pausa_motivo    text;        -- NULL = no pausado
ALTER TABLE cne.configuracion ADD COLUMN IF NOT EXISTS correo_pausa_motivo      text;
ALTER TABLE cne.envios_credencial ADD COLUMN IF NOT EXISTS intentos int NOT NULL DEFAULT 0;   -- 1 = ya se intentó (no reenviar a ciegas)

-- 9. La persona incorporada está presente sin lectura de puerta. Mismas columnas y orden (CREATE OR REPLACE lo permite).
CREATE OR REPLACE VIEW cne.v_mjrv_asignacion WITH (security_invoker = true) AS
SELECT m.id AS mjrv_id, m.junta_origen_id,
       coalesce((SELECT d.junta_destino_id FROM cne.decisiones_movimiento d
                 WHERE d.mjrv_id = m.id AND d.decision = 'aceptada'
                 ORDER BY d.creado_en DESC, d.id DESC LIMIT 1), m.junta_origen_id) AS junta_actual_id,
       (m.incorporado_en IS NOT NULL
        OR EXISTS (SELECT 1 FROM cne.lecturas_puerta l WHERE l.mjrv_id = m.id AND l.resultado = 'valido')) AS ingresado,
       EXISTS (SELECT 1 FROM cne.excepciones_disponibilidad e WHERE e.mjrv_id = m.id AND e.activa) AS con_excepcion
FROM cne.mjrv m WHERE m.activo;
```

Además en D01:
- `db/grants.sql`: `INSERT, UPDATE` a `cne_app` sobre `cne.asignaciones_cargo` y `cne.fichas_abiertas_finanzas`. Sin `DELETE` (como el resto).
- `src/domain/limpieza.ts` y `src/server/preparar-eleccion.ts`: añadir `fichas_abiertas_finanzas` («Fichas abiertas en finanzas») y `asignaciones_cargo` («Cargos asumidos») **antes** de `decisiones_movimiento`/`mjrv` en el orden de borrado; las fichas incorporadas en modo prueba ya caen en `mjrv WHERE es_prueba` (se insertan con `es_prueba = cne.en_prueba()`).
- Una persona incorporada en **modo prueba** es `mjrv.es_prueba = true` y se borra al preparar la elección; en **modo elección** es real.

---

## 3. Diseño por bloque

### 3.1 Importe en EUR (decisiones 1 y 2)

- `src/domain/pago.ts`: `ParametrosPago = { importe_eur, pagador_nombre, pagador_cargo, lugar }`. `calcularImporteEur` devuelve el `importe_eur` validado (decimal > 0, hasta 2 decimales, en céntimos `bigint`) o `pendiente`. Se borran `Sentido`, `Redondeo`, la conversión y sus pruebas.
- Sin importe aprobado → igual que hoy: acta BORRADOR y confirmación bloqueada. Nada de valores por defecto.
- Acta (`src/server/pdf/acta.ts`): bloque «3 · Importe» = una línea «Importe entregado: NNN,NN EUR». Bajo el título actual, subtítulo «Comprobante de pago». Resto igual (decisión 2).
- `actas_pago.parametros` guarda la copia de los parámetros nuevos (trazabilidad); `importe_usd`/`tipo_cambio` se insertan NULL.
- Panel, informe PDF/Excel (`src/domain/informe.ts`, `src/server/informe-excel.ts`, `src/server/pdf/informe.ts`, `src/server/finanzas-resumen.ts`): columnas sin «USD ref.» ni «T. cambio». Los pagos de prueba ya confirmados con USD siguen mostrando su `importe_eur`, que es lo único que se lista.

### 3.2 Rótulo y nomenclatura del Excel (decisión 3)

- Más encabezados para `rotulo`: `rotulo`, `rotulo credencial`, `credencial`, `codigo credencial`, `etiqueta` (sin tildes ya normalizado).
- Si el archivo **no** trae columna de rótulo: el rótulo es **el texto de la columna junta tal cual viene en el Excel** (p. ej. «M01»). La vista previa lo dice en un aviso destacado: «El archivo no trae columna de rótulo: se imprimirá el texto de la junta tal cual (M01…)».
- Nomenclatura: si alguna celda de junta (o de serie) es `F` + número o «F»/«femenino», el archivo usa **M = masculino / F = femenino**: se interpreta M → serie H y F → serie M, y la vista previa lo avisa en grande con un recuento por serie. Sin ninguna `F`, se mantiene H/M como hoy. Así no se convierte M01 en «mujeres» por suposición (guía §3).
- El rótulo nunca se recalcula: lo que trae el Excel se imprime tal cual.

### 3.3 Puerta (decisiones 5 y 6)

| Caso | Hoy | Nuevo |
| --- | --- | --- |
| Primera lectura de persona activa | Verde «Válida» | Igual |
| Persona activa ya ingresada | Rojo «Ya registró su ingreso a las hh:mm» | **Amarillo** «Ya ingresó a las hh:mm» + nombre y junta + botón grande **«Dejar pasar»** y botón «No pasa / Siguiente». Un pitido medio (distinto de verde y rojo). |
| Desconocida | Rojo | Rojo «QR no reconocido» |
| Dada de baja | Rojo «bloqueado» | Rojo «Dada de baja en la lista» |

- La lectura sigue guardándose como `duplicado`. «Dejar pasar» → `POST /api/e/puerta/pase {mjrvId}` (solo `e_puerta`) inserta `reingreso_autorizado` con operador, enlace y hora. No toca `lecturas_un_ingreso` (solo cuenta `valido`): **no cuenta dos veces**.
- La respuesta de reingreso incluye `mjrvId` (necesario para el botón); ningún otro dato nuevo.

### 3.4 Cargos por junta (decisión 9)

**Regla.** Cada junta tiene tres cargos: presidente, secretario, vocal. Junta **completa (verde)** = los tres cubiertos. **Ámbar** = alguien presente pero falta algún cargo («Falta secretario», «Faltan presidente y vocal»). **Rojo** = nadie presente. La marca ⇄ de movimiento se mantiene.

**Cobertura (función pura `cubrirCargos` en `src/domain/cargos.ts`, determinista).** Solo cuentan personas *disponibles* (ingresadas sin excepción) cuya junta vigente es la junta. Para cada junta:
1. **Asignación explícita activa** (`asignaciones_cargo` de esa junta) → cubre ese cargo (tipo `traslado`, `incorporado` o `manual`).
2. Cargos restantes: **titular** con `rol` = cargo, sin asignación explícita a otro cargo → tipo `titular`. Si hay varios titulares del mismo rol, cubre el primero; los demás quedan presentes sin cargo.
3. Cargos restantes, en orden presidente → secretario → vocal: **suplentes de la propia junta** (`rol = 'suplente'`, `junta_origen = junta`, sin asignación explícita), en orden `fila_origen`, `apellidos`, `id` → tipo `suplente_junta` («cargo asumido» automático). Ver pregunta Q-D1.
4. Lo que queda → **vacante**.
- **Transferibles** = suplentes disponibles de la junta que no cubren ningún cargo (solo existen si la junta está completa).
- Si llega tarde el titular de un cargo ya cubierto por un sustituto explícito, el sustituto conserva el cargo y el titular queda presente sin cargo (el centro de mando puede reasignar a mano).
- Una asignación explícita cuyo titular deja de estar disponible o cambia de junta no cubre nada (se ignora al calcular). Toda nueva asignación de ese puesto o de esa persona **anula** la anterior en la misma transacción (índices únicos parciales).

**Orden para cubrir una vacante** (decisión 9): 1º suplente de la misma junta (paso 3, automático); 2º suplente transferible de la misma zona; 3º de la zona más cercana (`|orden_cercania|`); 4º votante incorporado (formulario, manual). Las opciones 2º y 3º son las propuestas actuales.

### 3.5 Propuestas y traslados con cargo

- `proponer` usa `cubrirCargos`: destinos = juntas con vacantes (1 vacante primero, después 2, después 3); candidatos = transferibles no «no viables». Mismo orden de desempate que hoy. La propuesta añade `cargo` (primera vacante del destino) y `vacantes` (todas).
- Sin candidatos y con vacantes: la tarjeta dice «No hay suplentes transferibles. Si hace falta, incorpore un votante» y abre el formulario (§3.6).
- `aceptarPropuesta(actor, {mjrvId, origenId, destinoId, cargo})`: bajo los mismos bloqueos de aviso, comprueba que la persona sigue siendo transferible en el origen y que `cargo` sigue vacante en el destino; inserta la decisión `aceptada` **y** la `asignaciones_cargo` (`origen = 'traslado'`). El cargo es **editable** en la tarjeta (selector con las vacantes del destino).
- `moverManual` acepta `cargo` opcional (vacantes del destino o «sin cargo»); si la persona cubre un cargo en el origen pide confirmación («H12 quedará sin secretario. ¿Continuar?»). Anula la asignación anterior de la persona.
- Ficha de junta (`src/components/ficha-junta.tsx`): tres filas de cargo con quién lo cubre y su tipo («Titular», «Suplente de la junta», «Trasladado desde H3», «Votante incorporado», «Asignado a mano»); en cada vacante, «Asignar» con las personas presentes en la junta sin cargo → `asignaciones_cargo` `manual`; en cada asignación explícita, «Quitar».

### 3.6 Incorporar un votante como MJRV

- Botón «Incorporar votante» en el centro de mando (`/admin/mando` y estación de mando). Formulario: nombres, apellidos, cédula, junta (solo juntas con vacantes), cargo (solo vacantes de esa junta), teléfono y correo opcionales.
- Servidor (`src/server/incorporar.ts`), una transacción con `pg_advisory_xact_lock(7001, junta)`: normaliza la cédula igual que el importador y valida el mismo formato; si la cédula ya existe (activa o de baja) → «Ya existe una ficha con esa cédula (junta X, estado Y). No se creó otra.»; recalcula la cobertura y exige que el cargo siga vacante; inserta `mjrv` (`rol 'otro'`, `cargo_original 'VOTANTE INCORPORADO'`, `junta_origen_id` = junta, `incorporado_en = now()`, `incorporado_por` = nombre del actor, `fuente_archivo 'incorporado desde votantes'`, `es_prueba = cne.en_prueba()`) y la `asignaciones_cargo` (`incorporado`); auditoría `votante_incorporado`.
- Queda **presente** (vista), marcada «Incorporada desde votantes» en la ficha MJRV y en la ficha de junta, y puede documentarse (`/d`, estación) y cobrar como cualquier MJRV. No tiene rótulo: no entra en credenciales (correcto: ya está dentro).

### 3.7 WhatsApp y correo reales (decisión 4)

**Servicio y claves (verificado en `/home/user/consulares`).** En `docker-compose.prod.yml` de consulares el servicio se llama `evolution-api` (perfil `whatsapp`, imagen `evoapicloud/evolution-api:v2.3.7`), escucha en **8080** y está en la red `interna` = `citas-prod_interna`, a la que `cne-app` ya está unido. Consulares lo usa como `EVOLUTION_API_URL: http://evolution-api:8080` (fijado en su Compose, no en `.env`). La clave global está en `EVOLUTION_API_KEY` de `/home/ubuntu/consulares/.env.production` (y es la misma que `AUTHENTICATION_API_KEY` de `docker/evolution.env`, según `docker/evolution.env.example`). Brevo: `BREVO_API_KEY` y remitente verificado `MAIL_FROM_ADDRESS` en el mismo `.env.production`.

**Despliegue (`scripts/deploy-oracle.sh`, bloque Python).** Lee `/home/ubuntu/consulares/.env.production` con la función `dotenv` que ya existe (y, si falta la clave, `AUTHENTICATION_API_KEY` de `/home/ubuntu/consulares/docker/evolution.env`) y escribe en `.env.production` de CNE: `EVOLUTION_API_URL='http://evolution-api:8080'`, `EVOLUTION_API_KEY`, `BREVO_API_KEY`, `MAIL_FROM_ADDRESS`. Nunca imprime valores: solo una línea «Claves de envío: WhatsApp sí/no, correo sí/no». Si los archivos no se pueden leer, deja las variables vacías y el despliegue sigue (la app funciona en simulado). Ningún contenedor de consulares se toca.

**Línea propia.** Instancia de nombre fijo **`cne-madrid`** (constante `INSTANCIA_CNE` en `src/server/envios/evolution.ts`). El cliente es una copia reducida de `consulares/src/domain/evolution.ts` (`HttpEvolutionClient`: `createInstance` **sin webhook**, `connect` → QR en data URL, `summary` → estado y número, `logout`) más `sendMedia` de `teinvito/src/server/whatsapp.ts` (`evolutionMediaRequest`: documento PDF en base64 con texto como pie). Todas las rutas llevan `INSTANCIA_CNE`: la clave global también abre las instancias de consulares, así que una prueba comprueba que ninguna URL del cliente se construye con otro nombre.

**Pantalla (recomendada en superadmin: `/superadmin/envios`).** Motivo: junta línea, interruptor y claves tras la 2FA; la admin no necesita verlo. Contenido:
- «Línea de WhatsApp de CNE»: estado (sin crear · esperando QR · vinculada con +34… · desconectada); botones «Crear y vincular» (crea si no existe y muestra el QR, refresco cada 3 s por `GET /api/superadmin/whatsapp/estado`), «Desvincular» (logout, con confirmación).
- Interruptores «Envío real por WhatsApp» y «Envío real por correo» (por defecto apagados; encender exige escribir `ENVIO REAL`; auditoría). No se pueden encender si falta la clave, si la línea no está vinculada (WhatsApp), si falta remitente (correo) o si falta `HOST_MADRID` (el enlace del mensaje).
- Remitente del correo: dirección (precargada con `MAIL_FROM_ADDRESS`) y nombre (vacío hasta que Pablo lo diga, Q-D2).
- Cola: en cola, enviados hoy, fallidos, próximo envío, motivo de pausa y botón «Reanudar».

**Cola sin trabajador.** Un solo contenedor `cne-app`: `src/instrumentation.ts` (`register()`, solo si `NEXT_RUNTIME === 'nodejs'`; consultar `node_modules/next/dist/docs/…/instrumentation.md` antes de escribirlo) arranca un `setInterval` de 5 s que llama a `procesarCola()`. Por qué así: el estado vive en la base (sobrevive a reinicios), no hay otro contenedor que vigilar ni memoria extra, y un envío cada 20–45 s cabe de sobra en el proceso web. `cne-migrate` no ejecuta `next start`, así que no envía.
- `enviarCredencial` (admin): si el canal está en real y la ficha es real (`mjrv.es_prueba = false`), solo **encola** (`estado 'en_cola'`, `simulado = false`) y responde «En cola». Si no, envía simulado al momento como hoy. Las fichas de demostración **nunca** salen por real. El lote (`enviarLote`) encola en un momento.
- `procesarCola(ahora, azar, clientes)` en `src/server/envios/cola.ts`, por canal: `pg_try_advisory_lock(4343)` (si otro proceso lo tiene, no hace nada) → interruptor encendido, sin pausa, dentro de horario, `ahora ≥ <canal>_proximo_en`, por debajo del tope diario → reclama **una** fila `en_cola`, `simulado = false`, `intentos = 0` (`FOR UPDATE SKIP LOCKED`, `intentos = 1`, commit) → (WhatsApp) comprueba `connectionState` = abierta, si no, pausa «La línea de WhatsApp no está vinculada» → envía → `enviada_al_servicio` + `id_externo` o `fallo` + error corto → fija `<canal>_proximo_en = ahora + azar`.
- Ritmo y límites (constantes en `src/domain/envios-ritmo.ts`, función pura): WhatsApp 20–45 s al azar (como consulares/teinvito); correo 2–5 s. Horario 9:00–21:00 Europe/Madrid, todos los días. Tope diario: 150 WhatsApp (el de consulares) y 200 correos (la cuenta de Brevo es la de consulares y comparte cupo). Tras **5 fallos seguidos** del canal → pausa con motivo; solo la superadmin reanuda. Q-D3.
- Al arrancar: filas `en_cola` con `intentos = 1` (interrumpidas a medio envío) → `fallo` «Interrumpido: no se sabe si salió. Reintente si no le llegó.» Así nunca se reenvía a ciegas.
- Estados visibles sin cambio (§13.3): «En cola», «Enviada al servicio», «Falló el envío». No hay webhooks: nunca «entregada».
- `WHATSAPP_REAL_SEND`/`EMAIL_REAL_SEND` dejan de usarse (el interruptor está en la base).

**Mensaje (decisiones 4 y 10b).** WhatsApp: PDF de la credencial + texto; correo: asunto actual + texto + PDF adjunto (`BrevoHttpSender` de `consulares/src/domain/providers.ts`, `POST https://api.brevo.com/v3/smtp/email`). Texto:
> Buen día, {nombres}. Le enviamos su credencial de miembro de Junta Receptora del Voto ({rótulo}). Preséntela con su cédula. Para su comprobante de pago necesitamos la foto de su cédula (anverso y reverso). Puede subirla aquí: https://{HOST_MADRID}/d

Si el formulario `/d` está cerrado, la pantalla de credenciales avisa «El enlace del mensaje lleva al formulario de la cédula, que ahora está cerrado».

### 3.8 Aviso en finanzas y borrado de fotos (decisión 10)

- `fichaPago` (al abrir una ficha en finanzas) hace UPSERT en `fichas_abiertas_finanzas` con su enlace y operador, y devuelve `otrosPuestos`: filas de la misma persona con otro enlace y `abierta_en > now() - 5 min`. La pantalla muestra en ámbar: «Finanzas 2 (Ana) abrió esta ficha hace 1 min. Compruebe que no la está pagando.» Nunca bloquea; el doble pago lo sigue impidiendo la confirmación atómica.
- Superadmin › «Fotos de cédula»: recuento de personas con fotos y de ellas sin pago confirmado; botón rojo «Borrar todas las fotos de cédula» con frase `BORRAR FOTOS`; `withOwnerTx` (cne_app no tiene DELETE) `DELETE FROM cne.documentos_mjrv` (la RLS limita al modo actual); auditoría con el recuento. Aviso en pantalla: las copias de seguridad diarias guardan las fotos cifradas hasta 14 días.

---

## 4. Tareas (por prioridad para el 29-11)

### D01 · Migración y limpieza
- **Objetivo:** todo el esquema de §2 en una migración aditiva.
- **Archivos:** `db/migrations/2026-11-19-decisiones-18-11.sql`, `db/grants.sql`, `src/domain/limpieza.ts`, `src/server/preparar-eleccion.ts`, `tests/preparar-eleccion.test.ts`, nueva `tests/migracion-decisiones.test.ts`.
- **Pasos:** escribir la migración de §2; grants; dos categorías nuevas de limpieza en orden correcto.
- **Criterio:** `npm run db:prepare` dos veces seguidas sobre una base con datos de la versión publicada no falla; la versión anterior del código pasa sus pruebas contra el esquema nuevo (se comprueba con `git stash` o `git worktree` de `ce42e76`).
- **Pruebas:** la migración es idempotente; insertar `reingreso_autorizado` funciona y `valor_raro` falla; dos `asignaciones_cargo` activas para el mismo puesto fallan; una persona con `incorporado_en` sale `ingresado` en la vista; «Preparar elección» borra asignaciones y fichas abiertas de prueba y conserva las reales.

### D02 · Importador: rótulo del Excel y nomenclatura M/F
- **Objetivo:** §3.2, antes de cargar el Excel real.
- **Archivos:** `src/domain/importacion/mjrv.ts`, `src/components/importador-mjrv.tsx`, `tests/importacion-mjrv.test.ts`.
- **Pasos:** encabezados nuevos de rótulo; respaldo «texto de junta tal cual»; detección de `F` → M=H y F=M con aviso y recuento.
- **Criterio:** un archivo con columna «Rótulo» imprime ese texto; sin ella, el rótulo es el texto de junta («M01»); un archivo con M01 y F01 importa M01 en H1 y F01 en M1 con aviso visible; un archivo con H12/M3 se importa como hoy.
- **Pruebas:** los tres casos anteriores y que el rótulo existente no se pisa con NULL al reimportar (comportamiento actual con `coalesce`).

### D03 · Importe fijo en EUR y «comprobante de pago»
- **Objetivo:** §3.1.
- **Archivos:** `src/domain/pago.ts`, `src/server/pago.ts`, `src/components/form-parametros-pago.tsx`, `src/app/admin/(panel)/finanzas/page.tsx`, `src/server/finanzas.ts`, `src/server/pdf/acta.ts`, `src/domain/informe.ts`, `src/server/informe-excel.ts`, `src/server/pdf/informe.ts`, `src/server/finanzas-resumen.ts`, `src/app/e/[token]/trabajo/finanzas.tsx`; pruebas `tests/pago.test.ts`, `tests/pago-db.test.ts`, `tests/finanzas.test.ts`, `tests/finanzas-resumen.test.ts`.
- **Pasos:** parámetros = importe EUR + pagador + lugar; acta y confirmación insertan `importe_usd`/`tipo_cambio` NULL; quitar USD y cambio de pantallas, acta, panel e informes; subtítulo «Comprobante de pago».
- **Criterio:** sin importe EUR el acta sale BORRADOR y no se confirma; con 60,00 (valor de prueba evidente, que se vacía después) acta y pago dicen 60,00 EUR; `grep -ri "usd\|tipo de cambio" src` solo encuentra la migración/esquema y comentarios.
- **Pruebas:** validación (0, negativo, 3 decimales, texto → rechazados); confirmación atómica concurrente sigue dando un solo pago; informe sin columnas USD.

### D04 · Puerta: reingreso amarillo y «Dejar pasar»
- **Objetivo:** §3.3.
- **Archivos:** `src/server/puerta.ts`, `src/app/api/e/puerta/route.ts`, nueva `src/app/api/e/puerta/pase/route.ts`, `src/app/e/[token]/trabajo/puerta.tsx`, `src/components/sonidos.ts`, `tests/puerta.test.ts`, `tests/permisos.test.ts`.
- **Criterio:** segunda lectura → amarillo con la hora del primer ingreso; «Dejar pasar» crea una fila `reingreso_autorizado` y el contador de ingresados no cambia; baja → rojo «Dada de baja en la lista»; desconocida → rojo.
- **Pruebas:** lectura doble simultánea sigue dando un solo `valido`; pase de una persona sin ingreso previo → 409; matriz: `POST /api/e/puerta/pase` solo `e_puerta`.

### D05 · Claves de envío en el despliegue y clientes reales
- **Objetivo:** §3.7 «Servicio y claves» y clientes Evolution/Brevo con simulados para pruebas.
- **Archivos:** `scripts/deploy-oracle.sh`, `tests/deploy.test.ts`, `.env.example` (`EVOLUTION_API_URL=simulado`, `EVOLUTION_API_KEY=`, `BREVO_API_KEY=`, `MAIL_FROM_ADDRESS=`), nuevos `src/server/envios/evolution.ts`, `src/server/envios/brevo.ts`, `tests/envios-clientes.test.ts`.
- **Pasos:** copiar las cuatro variables sin imprimir; clientes con `fetch` inyectable; `EVOLUTION_API_URL=simulado` o vacío → cliente simulado (como consulares).
- **Criterio:** el script con archivos de consulares ficticios en un directorio temporal escribe las variables y su salida no contiene ningún valor; sin esos archivos el despliegue sigue.
- **Pruebas:** URLs y cabeceras (`apikey`, `api-key`) con `fetch` falso; toda URL de Evolution contiene `/cne-madrid`; ninguna prueba abre red.

### D06 · Línea de WhatsApp de CNE en la superadmin
- **Objetivo:** crear, vincular por QR, ver estado y desvincular.
- **Archivos:** `src/app/superadmin/(panel)/envios/page.tsx`, `src/server/whatsapp-linea.ts`, `src/server/superadmin-actions.ts` (acciones `crearLineaAccion`, `desvincularLineaAccion`), `src/app/api/superadmin/whatsapp/estado/route.ts`, `src/components/superadmin-formularios.tsx`, `tests/whatsapp-linea.test.ts`, `tests/permisos.test.ts`.
- **Criterio:** con el cliente simulado: «Crear y vincular» muestra un QR, el estado pasa a «vinculada», «Desvincular» la deja «desconectada» y apaga el interruptor de WhatsApp; todo queda en auditoría.
- **Pruebas:** acciones y ruta solo `superadmin`; crear dos veces no duplica la instancia.

### D07 · Interruptores y cola de envío real
- **Objetivo:** §3.7 «Cola sin trabajador».
- **Archivos:** `src/instrumentation.ts`, `src/domain/envios-ritmo.ts`, `src/server/envios/cola.ts`, `src/server/envios.ts`, `src/server/envios/proveedor.ts`, `src/server/superadmin-actions.ts` (`interruptorEnvioAccion`, `reanudarEnviosAccion`, `guardarRemitenteAccion`), `src/app/superadmin/(panel)/envios/page.tsx`, `src/components/envios-credenciales.tsx`, `tests/envios.test.ts`, nuevas `tests/envios-ritmo.test.ts`, `tests/envios-cola.test.ts`, `tests/permisos.test.ts`.
- **Criterio:** con interruptor apagado todo sigue simulado como hoy; encendido, el lote encola y `procesarCola` (con reloj y azar inyectados, clientes falsos) envía uno cada 20–45 s, nada fuera de 9–21 h, para en el tope diario, pausa tras 5 fallos seguidos y no envía nunca fichas `es_prueba`; tras un reinicio simulado, una fila interrumpida pasa a `fallo` y no se reenvía.
- **Pruebas:** las del criterio + no encender sin clave/línea/remitente/HOST_MADRID + `pg_try_advisory_lock` evita dos procesos a la vez.

### D08 · Mensaje de credencial con el enlace del formulario
- **Objetivo:** texto de §3.7 en WhatsApp y correo; aviso si `/d` está cerrado.
- **Archivos:** `src/server/envios.ts` (texto en una función pura `textoCredencial` en `src/domain/`), `src/app/admin/(panel)/credenciales/page.tsx`, `tests/envios.test.ts`.
- **Criterio:** el texto lleva `https://<HOST_MADRID>/d` y las palabras «comprobante de pago»; sin `HOST_MADRID` el envío real no se enciende; con el formulario cerrado aparece el aviso.

### D09 · Cargos por junta en el centro de mando
- **Objetivo:** §3.4 (cobertura, verde = 3 cargos, ficha de junta con cargos, asignar/quitar a mano).
- **Archivos:** nuevo `src/domain/cargos.ts`, `src/domain/mando.ts`, `src/server/mando.ts`, `src/server/movimientos.ts` (`asignarCargo`, `quitarCargo`), `src/server/movimiento-actions.ts`, `src/components/centro-mando.tsx`, `src/components/ficha-junta.tsx`, `tests/cargos.test.ts`, `tests/mando.test.ts`, `tests/mando-db.test.ts`, `tests/permisos.test.ts`.
- **Criterio:** junta con presidente y secretario titulares + 1 suplente de la junta → verde; con presidente + 2 vocales titulares → ámbar «Faltan secretario»; titular tarde con sustituto explícito → sigue verde; con excepción de disponibilidad del sustituto → vuelve la vacante; indicadores coherentes con la lista; filtro «Faltan miembros» ordena por número de vacantes.
- **Pruebas:** tabla de casos de `cubrirCargos` (determinismo, desempate por `fila_origen`); asignación manual concurrente al mismo puesto → solo una (índice único); acciones nuevas solo `MANDO`.

### D10 · Propuestas y traslados asignan el cargo
- **Objetivo:** §3.5.
- **Archivos:** `src/domain/propuestas.ts`, `src/server/movimientos.ts`, `src/server/movimiento-actions.ts`, `src/app/api/mando/propuesta/route.ts`, `src/components/tarjeta-propuesta.tsx`, `src/components/ficha-junta.tsx`, `tests/propuestas.test.ts`, `tests/movimientos.test.ts`.
- **Criterio:** la propuesta muestra el cargo que falta y se puede cambiar por otra vacante; aceptar crea decisión + asignación en una transacción; si el cargo ya se cubrió entre medias → «La situación cambió»; un suplente que cubre un cargo en su junta nunca es propuesto; sin candidatos aparece «Incorpore un votante».
- **Pruebas:** misma zona antes que otra zona; zona más cercana antes que lejana; aceptación concurrente de dos propuestas al mismo puesto → una; `moverManual` con persona que cubre cargo pide confirmación.

### D11 · Incorporar un votante como MJRV
- **Objetivo:** §3.6.
- **Archivos:** nuevo `src/server/incorporar.ts`, `src/server/movimiento-actions.ts` (`incorporarVotanteAccion`), nuevo `src/components/form-incorporar.tsx`, `src/components/centro-mando.tsx`, `src/app/admin/(panel)/mjrv/[id]/page.tsx` (marca «Incorporada desde votantes»), `tests/incorporar.test.ts`, `tests/permisos.test.ts`.
- **Criterio:** el formulario solo ofrece juntas con vacantes y cargos vacantes; tras guardar, la junta cubre el cargo, la persona aparece presente con la marca y en finanzas se puede documentar y pagar; cédula repetida (también de baja) → rechazo sin crear nada; cargo cubierto entre medias → rechazo.
- **Pruebas:** las del criterio + en modo prueba la ficha es `es_prueba` y «Preparar elección» la borra; acción solo `MANDO`.

### D12 · Aviso no bloqueante en finanzas
- **Objetivo:** §3.8 (sustituye M24).
- **Archivos:** `src/server/finanzas.ts`, `src/app/api/e/finanzas/ficha/route.ts`, `src/app/e/[token]/trabajo/finanzas.tsx`, `tests/finanzas.test.ts`.
- **Criterio:** dos enlaces de finanzas abren la misma ficha → el segundo ve el aviso con etiqueta y operador del primero; pasados 5 min no aparece; generar acta y confirmar siguen funcionando con el aviso.

### D13 · Borrar fotos de cédula (superadmin)
- **Objetivo:** §3.8.
- **Archivos:** `src/server/documentos.ts` (`borrarTodasLasFotos`), `src/server/superadmin-actions.ts` (`borrarFotosAccion`), `src/app/superadmin/(panel)/page.tsx`, `tests/documentos.test.ts`, `tests/permisos.test.ts`.
- **Criterio:** sin la frase exacta no borra; con ella borra las fotos del modo actual, registra auditoría con el recuento y finanzas vuelve a pedir fotos; acción solo `superadmin`.

### D14 · Documentos, comprobación en producción y publicación
- **Archivos:** `db/seed/juntas-madrid.sql` y `src/domain/propuestas.ts` (comentarios: P-11 cerrada, orden del plano), `docs/diseno/08-comprobacion-primera-version.md` (nueva sección H), `docs/diseno/05-preguntas-abiertas.md` (P-3, P-4, P-5, P-7, P-8, P-9, P-11, P-12 → decididas el 18-11).
- **Sección H de 08 (con Pablo, en producción):** (1) `/superadmin/envios` dice «Claves de envío: sí»; (2) crear la línea `cne-madrid`, escanear el QR con el teléfono de la línea de CNE; (3) con el interruptor **apagado**, enviar a una ficha real de prueba: «simulado»; (4) solo con orden expresa de Pablo, encenderlo y enviar a **dos o tres teléfonos y correos propios** (fichas reales de prueba con esos datos, no demo); comprobar PDF, texto y enlace `/d`; (5) puerta: amarillo y «Dejar pasar»; (6) mando: cargos, propuesta con cargo, incorporar un votante ficticio en modo prueba; (7) finanzas: importe EUR, aviso de otro puesto; (8) `docker ps`: consulares (incluido `citas-prod-evolution-api`) con el mismo «Up» que antes.
- **Criterio:** checklist H completo; despliegue por el flujo habitual con copia previa.

---

## 5. Riesgos

- **Clave global de Evolution compartida.** Permite gestionar también las instancias de consulares. Mitigación: nombre de instancia constante y prueba que lo exige; la pantalla no lista ni toca otras instancias. Un error de CNE no debe desvincular números de consulares.
- **Bloqueo del número de CNE por WhatsApp** (Evolution no es oficial). Por eso ritmo 20–45 s, horario, tope diario y pausa por fallos. Con tantas fichas como la demostración (570; el número real lo dará el Excel) son unos 4 días a 150/día: **conviene empezar a enviar no más tarde del 24-11**.
- **Cupo de Brevo compartido con consulares.** Los correos de CNE restan del mismo plan; tope de 200/día por prudencia.
- **Excel real aún no visto.** D02 cubre rótulo y M/F, pero los encabezados reales pueden necesitar un alias más (cambio de una línea en `MAPEO_COLUMNAS`).
- **Cambio de semántica del verde.** Juntas con 3 presentes sin los tres cargos pasan a ámbar; los coordinadores deben saberlo antes del día (ensayo en D14).
- **Temporizador dentro de Next.** Si `instrumentation.ts` no arrancara en `next start`, la cola no avanza (se vería en «próximo envío»). D07 incluye comprobarlo en producción con el interruptor apagado (el temporizador registra un latido en el registro del contenedor, sin datos personales).
- **Revertir tras D03:** la imagen anterior mostraría importes NULL de USD en actas nuevas; no hay pérdida de datos, pero se recomienda no revertir más allá de D03 una vez haya pagos reales.

---

## 6. Preguntas para Pablo (el sistema funciona sin respuesta, con la recomendación)

**Q-D1 · Suplente de la propia junta: ¿asume el cargo solo?**
- **A.** Sí, automáticamente (se ve como «Suplente de la junta»; el centro de mando puede cambiarlo a mano). 
- **B.** No: el centro de mando lo confirma con un clic por cada vacante.
- **Recomendación:** A (es el primer paso del orden decidido, no mueve a nadie y evita decenas de clics en la apertura). Diseño actual: A.

**Q-D2 · Remitente del correo.**
- **A.** La dirección verificada de consulares (`MAIL_FROM_ADDRESS`) con el nombre que Pablo indique.
- **B.** Otra dirección (hay que verificarla antes en Brevo).
- **Recomendación:** A. Mientras no diga el nombre, el envío real por correo no se puede encender.

**Q-D3 · Ritmo y límites del envío real.**
- **A.** 9–21 h todos los días; 150 WhatsApp y 200 correos al día; pausa tras 5 fallos seguidos (diseño actual).
- **B.** Igual con horario 9–19 h de lunes a viernes, como los comunicados de consulares.
- **C.** Otros límites.
- **Recomendación:** A (B no deja enviar el fin de semana del 21–22 ni el 28).

Sigue **abierta** P-10 (confirmación física del traslado): no se toca.
