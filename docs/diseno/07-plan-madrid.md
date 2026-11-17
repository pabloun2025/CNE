# 07 · Plan reducido: sistema operativo de Madrid (prevalece sobre 00–06)

**Estado:** 17-11-2026. Cambio de alcance decidido por Pablo: **solo Madrid** (§7, §7.1–7.5, «Mapa de juntas de Madrid», §13), **modo prueba y preparación de la elección** (§8, §14.2–14.3) aplicados a Madrid y **superadministración mínima** (§14.1). **No** se construyen el portal consular (§5, §11) ni el tablero DGSMH (§6, §12).
**Sin entorno de ensayo (§8):** se diseña, construye y publica **directamente en producción**, una sola instalación, con el interruptor «Modo prueba» de la superadmin encendido hasta «Preparar elección».
**Meta inmediata:** **primera versión en producción** (PV1) publicada cuanto antes en la **VM Oracle** (camino principal, reutiliza T02 y 06). Render solo como alternativa si `ORACLE_SSH_KEY` no estuviera disponible (§3.6). Envíos de WhatsApp/correo simulados hasta orden expresa. Pautas Karpathy: lo mínimo que cumple; cada tarea con criterio verificable.

---

## 1. Qué cambia respecto a 00–06

| Documento | Sigue valiendo | Queda sin efecto |
| --- | --- | --- |
| 00 Arquitectura | Una app Next.js 16; despliegue en la VM (§3 de 00) con base en contenedor propio; sondeo JSON (mando 3 s, finanzas 5 s); `es_prueba` con `DEFAULT cne.en_prueba()`; limpieza con `respaldo_limpieza` en una transacción (§8 de 00); `pdf-lib` + `qrcode`; lector `BarcodeDetector` + `jsqr`; propuestas **deterministas**; interfaz (§12 de 00) | Separación **por host** (cuatro `HOST_*`) → **un host** y separación **por rutas** (§2). RLS por portal/consulado (`cne.portal`, `cne.consulado_id`). Trabajador y cola `trabajos`. Evolution/Brevo reales. Mapa mundial, terminador solar, husos horarios, borradores sin conexión. |
| 01 Modelo de datos | Roles `cne_owner`/`cne_app` (§1 de 01); tablas de Madrid (con los cambios de §4); SQL de ingreso idempotente y pago atómico (§5 de 01); importador MJRV (§8 de 01) | Tablas consulares (`consulados`, `recintos`, `jrv`, `zonas_referencia_2026`, `reportes_hito*`, `votantes*`, `sin_novedades`, `tipos_incidencia`, `incidencias`, `incidencia_jrv`, `actuaciones_incidencia`, `solicitudes_apoyo`, `operaciones_recibidas`), `trabajos`, políticas RLS de §4 de 01 (sustituidas por la de §4 abajo). |
| 02 Pantallas | C.2–C.9 (estaciones, puerta, mando, documentos, finanzas, acta provisional, credencial CR80 y A4 10 por hoja) con las rutas de §5 | A (consular), B (DGSMH), D salvo lo mínimo de §5. `/documentos-qr` con token rotatorio → `/d` con interruptor abierto/cerrado. |
| 03 Reciclaje | Infraestructura (`oracle-deploy.yml`, `deploy-oracle.sh`, `docker-compose.oracle.yml`, `ci.yml`, `backup.sh`, `postgres-init.sh`, `cloudflare-dominio.py`), `crypto.ts`, `passwords.ts`, `env.ts`, `db.ts` (reducido), `totp.ts`/`mfa.ts`, `door-scanner.tsx`, `door-feedback.ts`, `invitation-ticket.ts`, `live-board.tsx`, logotipo | `jobs.ts`, `whatsapp.ts`/`evolution.ts`, `brevo.ts` (hasta orden de envío real); `phone.ts` opcional |
| 04 Plan | T01 (hecha), T02 (hecha, sin commit) | Todo lo demás: lo sustituye este documento. |
| 05 Preguntas | P-5 a P-12 y P-14; **P-1 reducida a un host** (Q-R1) | P-2 (queda A), P-3, P-4 (aplazadas: envíos simulados), P-13, P-15, P-16, P-17 (fuera de alcance) |
| 06 Despliegue | Todo, con los cambios de §3.2–§3.3 (un host, sin trabajador, sin Evolution/Brevo) | Variables `HOST_CONSULAR`, `HOST_DGSMH`, `HOST_ADMIN`; copia de claves de Evolution/Brevo. |

---

## 2. Arquitectura reducida

- **Un host** de producción, `HOST_MADRID` (Q-R1). Rutas:

| Ruta | Quién | Sesión (cookie distinta, `httpOnly`, `sameSite=lax`, `secure`, `path=/`) |
| --- | --- | --- |
| `/admin/...` | Administración Madrid (correo + contraseña) | `cne_admin` → fila `sesiones` con usuario `madrid_admin` |
| `/superadmin/...` | Superadministración (contraseña; TOTP en M18) | `cne_super` → usuario `superadmin` |
| `/e/<token>` y `/e/<token>/trabajo` | Estación (puerta, documentación, mando, finanzas): nombre + PIN de 4 dígitos | `cne_estacion` → `sesiones_estacion` |
| `/d` | Formulario de documentos del QR genérico (público, limitado) | ninguna |
| `/api/salud` | Comprobación de salud (Docker y túnel) | ninguna |
| `/` | Redirige a `/admin` | — |

- **Barreras:** (1) cada layout, página, ruta API y Server Action llama a una guarda (`requireAdmin()`, `requireSuperadmin()`, `requireEstacion(funciones)`) que valida en servidor cookie → fila de sesión → tipo de usuario/función del enlace; la cookie de un tipo nunca vale para otro; (2) la web conecta como `cne_app` (sin DDL ni `DELETE` en actividad salvo lo indicado en 01); (3) **una sola** política RLS por tabla de actividad: `es_prueba = cne.en_prueba()` (§4). No hay RLS por portal: hay un solo ámbito (Madrid).
- **Recomendado:** Cloudflare Access (código por correo) delante de `/superadmin*` en el mismo host (regla por ruta), como consulares; capa añadida a la 2FA.
- **Sin trabajador.** Los envíos son simulados y se registran en la propia petición (M21). Se quita `cne-worker` del Compose (§3.3); `src/worker.ts` se borra.
- **Fotos de cédula:** `bytea` cifrado AES-256-GCM con `APP_MASTER_KEY` (`src/server/crypto.ts` de consulares, tal cual). Cliente recorta a la proporción ID-1 y reduce a ≤ 1.600 px; servidor re-codifica con `sharp` (sin EXIF) a JPEG ≤ 1.200 px, calidad 75 (≈ 150–300 KB). Así las copias `pg_dump` incluyen las fotos y no hay disco aparte. Nunca hay URL pública: se sirven solo dentro del acta o a la administración/estación tras la guarda.
- **Zona horaria:** fija `Europe/Madrid` para mostrar horas; todo se guarda en `timestamptz`.

---

## 3. Despliegue en producción

### 3.1 Camino principal: VM Oracle por GitHub Actions

Exactamente 06 §2–§6, con lo hecho en T02 (`docker-compose.oracle.yml`, `scripts/deploy-oracle.sh`, `docker/postgres-init.sh`, `docker/backup.sh`). Resumen:

1. **Secretos de GitHub** (06 §1.1), mínimos para PV1: `ORACLE_SSH_KEY`, `APP_MASTER_KEY` (`openssl rand -base64 32`, guardada también en el gestor de Pablo; nunca cambia), `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD_INICIAL`. Opcional: `CLOUDFLARE_API_TOKEN` (si no, el host se añade a mano en Zero Trust, 06 §3). **Variable** del repositorio: `HOST_MADRID`.
2. **`oracle-inspect.yml`** (ya existe, solo lectura) antes del primer despliegue: memoria ≥ 1,5 GB y disco ≥ 5 GB libres; existe `citas-prod_interna`. Si no se cumple, se avisa a Pablo y no se despliega.
3. **`.github/workflows/ci.yml`** (de `teinvito/.github/workflows/ci.yml`, 03): PostgreSQL 16 de servicio `cne_test`; `npm ci`, `tsc`, `lint`, `vitest`, `build`.
4. **`.github/workflows/oracle-deploy.yml`** (de `teinvito/.github/workflows/oracle-deploy.yml`, 03): manual (`workflow_dispatch`, entrada `accion: desplegar | revertir`) sobre `main`; ejecuta CI; empaqueta sin `.git`, `node_modules`, `backups`; JSON temporal con los secretos (borrado con `if: always()`); `scp` + `scripts/deploy-oracle.sh`.
5. **Túnel:** se añade **un** hostname (`HOST_MADRID`) al túnel existente con servicio `http://cne-app:38473` (06 §3). Nunca se toca un contenedor de consulares ni teinvito.

### 3.2 Variables de `.env.production` (las escribe `deploy-oracle.sh`, permisos 600)

| Variable | Origen | Uso |
| --- | --- | --- |
| `POSTGRES_PASSWORD` (`cne_owner`), `CNE_APP_PASSWORD` | Generadas en el primer despliegue y conservadas | Compose arma `DATABASE_URL` (`cne_app`) y `DATABASE_OWNER_URL` (`cne_owner`). |
| `APP_MASTER_KEY` | Secreto | Fotos y TOTP. Si difiere de la del servidor, el despliegue **se detiene** (ya en T02). La app no arranca si no decodifica a 32 bytes. |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD_INICIAL` | Secretos | `db:prepare` crea la superadmin solo si no existe, con `debe_cambiar = true`. |
| `HOST_MADRID`, `APP_VERSION` | Variable del repositorio / sha del flujo | `APP_VERSION` sale en `/api/salud`. |
| `BACKUP_KEEP_DAYS=14`, `BACKUP_INTERVAL_SECONDS` | Fijas | 86400; 3600 del 28 al 30-11. |

Ya no se escriben: `HOST_CONSULAR`, `HOST_DGSMH`, `HOST_ADMIN`, `EVOLUTION_*`, `BREVO_API_KEY`, `MAIL_*`. `WHATSAPP_REAL_SEND`/`EMAIL_REAL_SEND` no existen en esta versión: no hay código de envío real.

### 3.3 Cambios necesarios en T02 (antes del primer despliegue, tarea M01)

- `docker-compose.oracle.yml`: **quitar el servicio `cne-worker`** y `EVOLUTION_API_URL`. `cne-app` sigue en `cne_interna` + `citas_compartida` (alias `cne-app`) para el túnel.
- `scripts/deploy-oracle.sh`: `dc up -d` sin `cne-worker` (también en `revertir`); dejar de copiar `EVOLUTION_API_KEY`/`BREVO_API_KEY` de consulares; escribir `HOST_MADRID` en lugar de los cuatro hosts; mantener `pg_dump` previo, `cne:anterior`, comprobación de salud y sin `--remove-orphans`.
- `tests/compose.test.ts`: ajustar a los servicios `cne-postgres`, `cne-migrate`, `cne-app`, `cne-backup` (ningún servicio sin prefijo `cne-`; `cne-postgres` solo en `cne_interna`).
- `.env.example`: quitar `HOST_CONSULAR`, `HOST_DGSMH`, `HOST_ADMIN`, `EVOLUTION_*`, `BREVO_*`, `MAIL_*`, `*_REAL_SEND`; añadir `HOST_MADRID=localhost`.
- `src/worker.ts` y el script `worker` de `package.json`: borrar.
- `package.json`: `"start": "next start --hostname 0.0.0.0 --port ${PORT:-38473}"` (sirve igual en la VM y en la alternativa Render).
- Borrar `src/app/p/*` (portales por host de T01).

### 3.4 Migraciones

- El servicio `cne-migrate` (ya en T02) ejecuta `npm run db:prepare` con `DATABASE_OWNER_URL` antes de arrancar `cne-app`; si falla, `cne-app` no arranca y la versión anterior sigue sirviendo hasta que se revierta.
- `scripts/prepare-db.ts`: toma `pg_advisory_lock(4242)`; aplica `db/schema.sql` si no existe el esquema `cne`; aplica en orden `db/migrations/*.sql` no registradas en `cne.migraciones(nombre, aplicada_en)`; siembra las 95 juntas (`ON CONFLICT (serie, numero) DO NOTHING`); da los `GRANT` a `cne_app`; crea la superadmin si no existe. Todo idempotente. Si `DATABASE_OWNER_URL` falta, usa `DATABASE_URL` (necesario solo en la alternativa Render).
- Los `GRANT ... TO cne_app` van dentro de `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cne_app') THEN ... END IF; END $$;` para que el mismo esquema sirva también en Render (un solo rol).
- Cambios de esquema solo **aditivos** hasta el 30-11 (permite revertir con `cne:anterior` sin restaurar la base).

### 3.5 Comprobación de salud y publicación

- `GET /api/salud` → `SELECT 1` → `200 {"ok":true,"version":"<sha>","base":"ok"}`; si la base falla → `503 {"ok":false}`. Sin datos personales. La usa el `healthcheck` de `cne-app` y `deploy-oracle.sh`.
- Tras cada despliegue: `https://<HOST_MADRID>/api/salud` devuelve el sha esperado; `/admin/acceso` 200; `SELECT count(*) FROM cne.juntas_madrid` = 95 (en el registro de `cne-migrate`); `docker ps` muestra consulares y teinvito con el mismo «Up …» que antes.
- Copias: `cne-backup` diaria (14 días) + `pg_dump` previo a cada despliegue y a «Preparar elección».
- Producción arranca en **modo prueba** (valor inicial de `configuracion.modo`) con banda visible; los datos de demostración y las importaciones se lanzan desde la interfaz.

### 3.6 Alternativa breve: Render (solo si `ORACLE_SSH_KEY` no está disponible)

Un servicio web Node + PostgreSQL de Render, región `frankfurt`, desde `main`: `buildCommand: npm ci && npm run build`, `startCommand: npm run db:prepare && npm start` (sin paso previo ni consola en el plan gratuito), `healthCheckPath: /api/salud`. Variables: `DATABASE_URL` (de la base, `fromDatabase.connectionString`), `APP_MASTER_KEY`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD_INICIAL` (`sync: false`), `NODE_VERSION=22`. Un solo rol (sin `cne_app`); `/api/salud` usa `RENDER_GIT_COMMIT` si falta `APP_VERSION`. El código no cambia. Límites del plan gratuito (servicio que se duerme a los 15 min, base de 1 GB que caduca a los 30 días, sin copias): para la jornada exigiría plan de pago o volver a la VM. No se crea `render.yaml` salvo que se active esta alternativa.

---

## 4. Modelo de datos (delta sobre 01)

`db/schema.sql` = las tablas de Madrid de 01 §2 **copiadas tal cual salvo**:

1. **Se mantienen:** `configuracion`, `parametros_pago`, `usuarios`, `sesiones`, `intentos_acceso`, `operadores_madrid`, `enlaces_estacion`, `sesiones_estacion`, `juntas_madrid`, `mjrv`, `envios_credencial`, `lecturas_puerta`, `excepciones_disponibilidad`, `decisiones_movimiento`, `documentos_mjrv`, `actas_pago`, `pagos_confirmados`, `auditoria`, `respaldo_limpieza`. `atenciones_finanzas` solo si se aprueba P-8 (M24). `codigos_recuperacion` en M18.
2. `configuracion`: quitar `margen_alerta_min`; añadir `documentos_publico_abierto boolean NOT NULL DEFAULT false`.
3. `usuarios.tipo IN ('madrid_admin','superadmin')`; quitar `consulado_id` y su `CHECK`.
4. `sesiones`: `portal IN ('admin','superadmin')`; quitar `operador_nombre`, `recinto_id`.
5. `juntas_madrid`: quitar `jrv_id` y `rotulo_credencial`.
6. `mjrv`: añadir `rotulo_credencial text` (texto imprimible; del Excel si trae columna `rotulo`; NULL = **pendiente**, P-5). `rol` sigue derivado de `cargo_original`.
7. `enlaces_estacion.funcion IN ('puerta','documentacion','finanzas','mando')` (sin `documentos_publico`).
8. Nueva `migraciones(nombre text PRIMARY KEY, aplicada_en timestamptz DEFAULT now())`.
9. Vista `v_mjrv_asignacion` (de 01 §3): junta vigente = destino de la última `decisiones_movimiento` `aceptada`, si no, `junta_origen_id`; `presente` = existe lectura `valido` y no hay excepción activa.
10. RLS, solo filtro de modo, en cada tabla de **actividad** (`lecturas_puerta`, `excepciones_disponibilidad`, `decisiones_movimiento`, `documentos_mjrv`, `actas_pago`, `pagos_confirmados`):

```sql
ALTER TABLE cne.<t> ENABLE ROW LEVEL SECURITY;
ALTER TABLE cne.<t> FORCE ROW LEVEL SECURITY;   -- también filtra a cne_owner (limpieza y alternativa Render)
CREATE POLICY modo ON cne.<t> USING (es_prueba = cne.en_prueba()) WITH CHECK (es_prueba = cne.en_prueba());
```

Seed de juntas (`db/seed/juntas-madrid.sql`): 95 filas exactamente según la tabla «Numeración de las fichas» (H1–21 amarillo, H22–41 azul, M1–8 rojo, M9–29 celeste, M30–39 verde, M40–54 rosado). `orden_cercania` por bloque (cadena del «Orden de los bloques»: celeste 1, rojo 2, azul 3, amarillo 4, verde 5, rosado 6; distancia = |a − b|; P-11 sigue abierta). Las juntas son maestras reales: `es_prueba = false`.

---

## 5. Pantallas (rutas finales)

- **Admin** `/admin`: `acceso`, `cambiar-contrasena`, `/` (inicio, M22), `mjrv`, `mjrv/importar`, `mjrv/nueva`, `mjrv/[id]`, `credenciales`, `operadores`, `mando`, `documentos` (interruptor «Formulario abierto/cerrado» + cartel A4 con QR a `<URL>/d`), `finanzas` (parámetros + panel), `informes` (M20). Menú lateral en escritorio, desplegable a 375 px.
- **Estación** `/e/[token]` (identificación) → `/e/[token]/trabajo` muestra la pantalla de su función (puerta, documentación, mando, finanzas). Sin menú a otras funciones (§13.10). Cabecera: función · operador · conexión · «Cambiar operador».
- **Superadmin** `/superadmin`: `acceso`, `cambiar-contrasena`, `/` con: cuentas de admin Madrid (alta, contraseña temporal, desactivar), «Modo prueba» (conmutador), «Cargar datos de demostración» (solo en modo prueba), y en la segunda tanda «Borrar datos de prueba y preparar para elección» y 2FA.
- **Banda MODO PRUEBA** roja fija en todas las pantallas (admin, estación, `/d`, superadmin) cuando `modo = 'prueba'`.

---

## 6. Tareas

Convenciones para cada tarea: comentarios en español; `npx tsc --noEmit -p .`, `npm run lint`, `npm test`, `npm run build` en verde; pantallas revisadas a 375 px. Pruebas de base contra `DATABASE_TEST_URL` (PostgreSQL 16 local). Un commit por tarea («M0n · …»).

### Antes de empezar (T02)
Hacer commit de los archivos de T02 **tal cual** en un commit propio («T02 · Compose y script de despliegue en la VM»). Los ajustes de §3.3 van en M01.

---

## ▶ PRIMERA VERSIÓN EN PRODUCCIÓN (M01–M17)

### M01 · Esqueleto en producción (VM Oracle) con base
- **Objetivo:** que `main` llegue a producción con base conectada y el host público respondiendo, antes de construir nada más.
- **Archivos:** cambios de T02 de §3.3 (`docker-compose.oracle.yml`, `scripts/deploy-oracle.sh`, `tests/compose.test.ts`, `.env.example`, `package.json`, borrar `src/worker.ts` y `src/app/p/*`); `.github/workflows/ci.yml` y `.github/workflows/oracle-deploy.yml` (§3.1); `src/server/db.ts` (dos pools: `DATABASE_URL` = `cne_app` y `DATABASE_OWNER_URL` = `cne_owner` con caída a `DATABASE_URL`; `search_path=cne,public`; `withTx(fn)`; de `consulares/src/server/db.ts`, reducido); `src/server/env.ts` (consulares); `src/app/api/salud/route.ts`; `src/app/page.tsx` (redirige a `/admin`) y `src/app/admin/page.tsx` provisional.
- **Pasos:** ejecutar `oracle-inspect.yml` y anotar memoria y disco; lanzar «Deploy to Oracle» (`desplegar`); añadir `HOST_MADRID` al túnel (06 §3).
- **Criterio:** `https://<HOST_MADRID>/api/salud` → 200 con `base: "ok"` y el sha de `main`; consulares y teinvito sin reinicios (`docker ps`, mismo «Up»). Si `ORACLE_SSH_KEY` no está disponible: §3.6 y el mismo criterio con la URL de Render.
- **Pruebas:** `tests/salud.test.ts` (200 con base; 503 con `DATABASE_URL` a un puerto cerrado; `version` = `APP_VERSION`, si falta `RENDER_GIT_COMMIT`, si falta `dev`); `tests/compose.test.ts` actualizado.

### M02 · Esquema, migraciones al arrancar y 95 juntas
- **Archivos:** `db/schema.sql` (§4), `db/seed/juntas-madrid.sql`, `db/migrations/.gitkeep`, `scripts/prepare-db.ts` (§3.4), `src/server/crypto.ts` y `src/server/passwords.ts` (consulares, tal cual), `src/domain/juntas.ts` (tipos, colores de zona, `etiquetaJunta('H',12) = 'H12'`).
- **Criterio:** `npm run db:prepare` dos veces seguidas sobre base vacía no falla; 95 juntas (41 H, 54 M) con color correcto; superadmin creada una sola vez; arranque falla con mensaje claro si `APP_MASTER_KEY` no da 32 bytes.
- **Pruebas:** `tests/db/prepare.test.ts` (idempotencia, recuento por color = tabla de la especificación); `tests/db/modo.test.ts` (en modo `prueba` una fila insertada lleva `es_prueba = true`; al pasar a `eleccion` deja de verse; índice único de ingreso y de pago).

### M03 · Accesos admin y superadmin (contraseña) y guardas
- **Archivos:** `src/server/auth.ts` (de `consulares/src/server/auth.ts`, reducido: login por tipo, sesión 16 h con `token_hash` sha256, cierre, cambio obligatorio de contraseña, límites con `intentos_acceso`: 10 por correo y 30 por IP en 15 min, mensaje genérico), `src/server/guard.ts` (`requireAdmin`, `requireSuperadmin`), `src/server/auditoria.ts`, `src/domain/password-policy.ts` (mínimo 8), páginas `src/app/admin/acceso`, `src/app/admin/cambiar-contrasena`, `src/app/superadmin/acceso`, `src/app/superadmin/cambiar-contrasena`, `src/app/admin/layout.tsx`, `src/app/superadmin/layout.tsx`, `src/components/banda-prueba.tsx`.
- **Criterio:** sin sesión, `/admin/*` y `/superadmin/*` redirigen a su acceso; la cookie `cne_admin` no abre `/superadmin` y viceversa; primer acceso obliga a cambiar contraseña.
- **Pruebas:** `tests/auth.test.ts` (contraseña errónea, bloqueo por intentos, cookie de un tipo rechazada en el otro, sesión caducada o revocada).

### M04 · Superadministración mínima y modo prueba
- **Archivos:** `src/app/superadmin/page.tsx`, `src/server/superadmin-actions.ts` (crear admin Madrid con contraseña temporal, desactivar, restablecer; conmutar modo `prueba`↔`eleccion` con confirmación escrita y auditoría), `src/server/config.ts` (`leerModo()`).
- **Criterio:** el superadmin crea una cuenta de admin Madrid y esta entra; el conmutador cambia la banda en todas las pantallas; un admin Madrid no puede llamar a las acciones de superadmin (comprobado en servidor).
- **Pruebas:** `tests/superadmin.test.ts` (acción rechazada con sesión admin; cambio de modo auditado).
- **Nota:** el estado inicial es `prueba`. Pasar a `eleccion` sin limpiar es posible pero la limpieza llega en M19; en la primera versión el superadmin lo deja en `prueba`.

### M05 · Datos de demostración
- **Archivos:** `src/domain/demo.ts` (genera filas puras), `src/server/demo.ts`, botón en `/superadmin` («Cargar datos de demostración», solo en modo prueba; «Quitar datos de demostración» borra `mjrv` con `es_prueba = true` y su actividad; usa el pool `cne_owner`, igual que M19, porque `cne_app` no borra actividad).
- **Contenido (ficticio y rotulado):** por cada una de las 95 juntas reales, 6 fichas: PRESIDENTE, SECRETARIO, VOCAL, SUPLENTE ×3; `apellidos = 'APELLIDO PRUEBA 001'…`, `nombres = 'NOMBRE PRUEBA'`, cédulas `0000000001…0000000570`, sin teléfono ni correo, `rotulo_credencial` = `H01…H41` / `M01…M54` con `fuente_archivo = 'DEMO — rótulo provisional (P-5)'`, `es_prueba = true`. La cifra 6 es solo de demostración.
- **Criterio:** cargar dos veces no duplica; quitar deja 0 fichas de prueba y no toca fichas `es_prueba = false`.
- **Pruebas:** `tests/demo.test.ts`.

### M06 · Importador de MJRV (Excel/CSV)
- **Archivos:** `src/domain/importacion/mjrv.ts` (mapeo de columnas en un único objeto; normalización; reglas de 01 §8: errores bloquean, advertencias no), `src/server/importar-mjrv.ts`, `src/app/admin/mjrv/importar/page.tsx`, `public/plantillas/mjrv.xlsx` (solo encabezados: `cedula, apellidos, nombres, cargo, serie, junta, correo, telefono, rotulo`).
- **Pasos:** subir → vista previa (filas válidas, errores y advertencias por fila) → «Aplicar» en una transacción; actualiza por `cedula`; las ausentes se listan para baja con confirmación, nunca se borran. Filas importadas: `es_prueba = false`, `fuente_archivo` = nombre del archivo, `fila_origen`.
- **Criterio:** un archivo con cédula repetida o junta inexistente (`H42`, `M55`) no se aplica; uno válido se aplica entero o nada.
- **Pruebas:** `tests/importacion-mjrv.test.ts` (unidades del dominio con filas ficticias: cero perdido a la izquierda → advertencia y relleno; cargo desconocido → rol `otro`; junta inexistente → error; duplicado → error) y prueba de base de «todo o nada».

### M07 · Lista y ficha de MJRV
- **Archivos:** `src/app/admin/mjrv/page.tsx` (tabla con filtros junta/rol/estado y búsqueda por apellidos o cédula), `src/app/admin/mjrv/nueva/page.tsx`, `src/app/admin/mjrv/[id]/page.tsx`, `src/server/mjrv.ts`, `src/server/mjrv-actions.ts`.
- **Ficha:** identidad, cargo original, rol, rótulo imprimible (editable), junta de origen y vigente, contacto, llegada, movimientos, documentos (dos miniaturas solo tras la guarda), acta y pago. Acciones: editar, dar de baja / reactivar (no borra historial).
- **Criterio:** cédula única al crear/editar; la baja hace que la puerta responda «bloqueado» (M10).
- **Pruebas:** `tests/mjrv.test.ts`.

### M08 · Credencial CR80 y hoja A4
- **Archivos:** `src/server/pdf/credencial.ts` (base `teinvito/src/server/invitation-ticket.ts`; diseño 02 §C.9), `src/domain/credencial-layout.ts` (posiciones de la hoja A4: 2 × 5 giradas = 10 por hoja), `public/marca/cne-elecciones-2027.jpg` (extraído según 03), `src/app/admin/credenciales/page.tsx`, ruta `src/app/admin/credenciales/pdf/route.ts` (`?ids=` o filtro; individual o A4).
- **Reglas:** QR = cédula (nivel M); sin `rotulo_credencial` la persona se excluye y se avisa «Falta el rótulo de credencial de N personas» (P-5); en modo prueba o ficha `es_prueba`, franja diagonal «PRUEBA». Marca `credencial_generada_en`.
- **Criterio:** PDF individual de 85,6 × 54 mm; A4 con 10 credenciales sin salirse de la página; el QR se lee con un móvil y devuelve exactamente la cédula.
- **Pruebas:** `tests/credencial-layout.test.ts` (10 rectángulos dentro de 210 × 297 mm, sin solaparse); `tests/credencial-pdf.test.ts` (tamaño de página en puntos, número de páginas para 1, 10 y 11 personas).

### M09 · Operadores, PIN y enlaces de estación
- **Archivos:** `src/app/admin/operadores/page.tsx`, `src/server/estaciones.ts`, `src/server/estacion-actions.ts`, `src/app/e/[token]/page.tsx` (identificación: lista de nombres con esa función + teclado de 4 dígitos), `src/app/e/[token]/trabajo/page.tsx` (elige pantalla por función), `src/server/guard.ts` (`requireEstacion(funciones)`), `src/components/cabecera-estacion.tsx`.
- **Reglas (00 §5):** token de 32 bytes, se guarda su hash y una copia cifrada para volver a mostrar el QR del enlace; PIN `^\d{4}$` con argon2; 5 fallos por operador → 15 min; 20 por enlace en 15 min → 15 min; revocar enlace u operador invalida sus sesiones al instante.
- **Criterio:** un enlace de puerta no abre la pantalla de finanzas aunque se cambie la URL; un enlace revocado muestra «Este enlace ya no está activo».
- **Pruebas:** `tests/estaciones.test.ts` (PIN erróneo, bloqueo, revocación, función equivocada → 403).

### M10 · Puerta
- **Archivos:** `src/components/lector-qr.tsx` (de `teinvito/src/components/door-scanner.tsx`, recortado según 03), `src/components/sonidos.ts` (de `teinvito/src/components/door-feedback.ts`), `src/app/e/[token]/trabajo/puerta.tsx`, `src/app/api/e/puerta/route.ts`, `src/server/puerta.ts` (SQL idempotente de 01 §5).
- **Pantalla (02 §C.3):** verde «Válida» + pitido agudo + nombre y junta vigente; rojo + dos pitidos graves con motivo («Ya registró su ingreso a las hh:mm», «QR no reconocido», «Credencial dada de baja»); gris «No se pudo comprobar» si falla la red o la cámara; entrada manual de cédula. Duplicado = rojo (P-9 abierta: sin reingreso).
- **Criterio:** dos lecturas simultáneas de la misma cédula producen un solo `valido`; el centro de mando lo refleja en ≤ 3 s.
- **Pruebas:** `tests/puerta.test.ts` (válido, duplicado, desconocido, bloqueado, concurrencia con `Promise.all`).

### M11 · Centro de mando: las 95 juntas
- **Archivos:** `src/domain/mando.ts` (estado por junta: 0 rojo «Nadie», 1–2 ámbar «Faltan n», ≥ 3 verde «3 presentes»; marca ⇄ si hubo movimiento aceptado hacia o desde la junta; indicadores), `src/server/mando.ts`, `src/app/api/mando/estado/route.ts` (admin o estación `mando`), `src/components/centro-mando.tsx` (sondeo 3 s; patrón `teinvito/src/components/live-board.tsx`), `src/app/admin/mando/page.tsx`, `src/app/e/[token]/trabajo/mando.tsx`.
- **Pantalla (02 §C.4):** indicadores (ingresados / total, juntas con 3+, incompletas, sin nadie, suplentes transferibles); fichas «H12» con franja de color de zona y estado con color **y** texto; filtros «Faltan miembros» (por defecto: faltan 1 → 2 → nadie), «Con suplentes transferibles», «Completas», «Todas»; agrupar por zona o serie; ficha de junta al pulsar.
- **Criterio:** con la demo y 3 lecturas en H12, H12 aparece verde; con 1, ámbar «Faltan 2».
- **Pruebas:** `tests/mando.test.ts` (dominio puro con casos 0/1/2/3/4 presentes, excepción activa resta, movimiento cambia junta vigente).

### M12 · Propuestas y movimientos
- **Archivos:** `src/domain/propuestas.ts` (puro), `src/server/movimientos.ts`, `src/server/movimiento-actions.ts`, tarjeta de propuesta y ficha de junta en `src/components/centro-mando.tsx`.
- **Algoritmo determinista (§7.3, §13.6):**
  1. Destinos: juntas con 1–2 presentes primero (menos faltantes primero), después las de 0.
  2. Candidatos: personas **presentes** con rol `suplente`, cuya junta vigente tiene **> 3** presentes (el origen debe quedar con ≥ 3).
  3. Orden: misma zona antes que otra; después menor `|orden_cercania|`; después serie y número del destino; después serie y número del origen; después apellidos y cédula.
  4. Excluir: pares (persona, destino) con decisión `pasada`; personas con decisión `no_viable` (quedan fuera hasta que el centro de mando las vuelva a habilitar en la ficha de junta).
  5. Devuelve **una** propuesta.
- **Acciones:** Aceptar · Siguiente propuesta · No viable (motivo: no responde / se niega / no está / otro). Movimiento manual desde la ficha de junta (`manual = true`, con aviso si el origen queda con < 3). Marcar no disponible / quitar excepción.
- **Servidor al aceptar:** en transacción con `SELECT … FOR UPDATE` sobre la ficha, recalcula que la persona sigue presente, en el origen indicado y que el origen conserva ≥ 3 (salvo manual confirmado); si no, «La situación cambió» y nueva propuesta. Registra persona, origen, destino, actor y hora (§13.6).
- **Criterio:** la misma situación produce siempre la misma propuesta; nunca dos aceptaciones de la misma persona a la vez.
- **Pruebas:** `tests/propuestas.test.ts` (misma zona antes que otra; zona más cercana; no deja el origen con < 3; respeta `pasada`/`no_viable`; determinismo); `tests/movimientos.test.ts` (dos aceptaciones concurrentes → una sola).

### M13 · Documentos (`/d` y estación de documentación)
- **Archivos:** `src/app/d/page.tsx`, `src/app/api/d/buscar/route.ts`, `src/app/api/d/foto/route.ts`, `src/app/e/[token]/trabajo/documentacion.tsx`, `src/components/captura-cedula.tsx` (cámara trasera, recuadro ID-1, botón «Tomar foto», vista previa «Usar / Repetir», recorte al recuadro y reducción en `canvas`), `src/server/documentos.ts` (`sharp` → cifrar → UPSERT por `(mjrv_id, lado, es_prueba)`), `src/app/admin/documentos/page.tsx` (interruptor abierto/cerrado y cartel A4 con QR a `/d`).
- **Reglas:** `/d` solo funciona si `documentos_publico_abierto`; muestra el mínimo («J. P., junta H12») y pide confirmar; 10 consultas por IP cada 15 min (`CF-Connecting-IP`, que pone Cloudflare; si falta, primera IP de `X-Forwarded-For`); rechaza imagen < 20 KB o > 2 MB y reverso idéntico al anverso (sha256); el público no vuelve a ver las fotos. La estación de documentación (con PIN) ve el nombre completo y puede sustituir fotos. **Captura automática: M23** (segunda tanda).
- **Criterio:** tras subir anverso y reverso, la ficha muestra «Documentos completos»; en la base solo hay `bytea` cifrado (no JPEG legible).
- **Pruebas:** `tests/documentos.test.ts` (cifrar/descifrar ida y vuelta; mismo hash rechazado; formulario cerrado → 403; límite por IP).

### M14 · Parámetros de pago y cálculo
- **Archivos:** `src/domain/pago.ts` (puro), sección «Parámetros de pago» en `src/app/admin/finanzas/page.tsx`, `src/server/pago-actions.ts`.
- **Reglas:** `importe_usd`, `tipo_cambio`, `sentido_cambio` (`eur_por_usd` | `usd_por_eur`), `decimales_eur` (0 | 2), `redondeo` (`mitad_arriba` | `truncar`), pagador (nombre, cargo), lugar. **Todos vacíos por defecto**; ningún valor se propone en la interfaz (§7.5 ABIERTO, P-7). Cálculo con aritmética decimal en céntimos (sin `float`). Si falta algo: `importe_eur = null` y estado «Parámetros pendientes».
- **Criterio:** con parámetros incompletos la interfaz de finanzas no permite confirmar pagos.
- **Pruebas:** `tests/pago.test.ts` (ambos sentidos, ambos redondeos, 0 y 2 decimales, parámetros incompletos → null). Valores de prueba evidentemente ficticios (p. ej. 100 USD, cambio 1).

### M15 · Finanzas: acta provisional y confirmación atómica
- **Archivos:** `src/app/e/[token]/trabajo/finanzas.tsx`, `src/server/finanzas.ts`, `src/server/finanzas-actions.ts`, `src/server/pdf/acta.ts`, `src/app/api/e/finanzas/acta/[mjrvId]/route.ts`.
- **Flujo (02 §C.6, §13.8):** leer QR o escribir cédula → ficha con requisitos (ficha activa · anverso · reverso · sin pago previo · parámetros completos) → casilla «He verificado que cumplió sus funciones» → **«Generar e imprimir acta»** (registra `actas_pago`, `impresion_n`; segunda vez «REIMPRESIÓN n») → solo entonces aparece **«Confirmar pago entregado»** (otro color, separado, diálogo con importe y nombre) → «Pago confirmado hh:mm por <operador>». Ya pagado → banda roja «YA PAGADO …. No vuelva a pagar».
- **Acta (02 §C.8):** 2 páginas; banda «MODELO PROVISIONAL — PENDIENTE DE APROBACIÓN»; en modo prueba, marca de agua «PRUEBA — SIN VALIDEZ» y número `PRUEBA-000123`; página 2 con anverso y reverso descifrados en memoria. Sin documentos completos no se genera; sin parámetros solo sale «BORRADOR — importe pendiente» y no se puede confirmar.
- **Confirmación:** SQL de 01 §5 (bloqueo de fila + `ON CONFLICT (mjrv_id, es_prueba) DO NOTHING`). En modo prueba el pago queda `es_prueba = true` = **simulado**, y se muestra «Pago simulado».
- **Criterio:** dos puestos confirmando a la vez la misma persona → un solo pago; imprimir no cambia el estado a pagado.
- **Pruebas:** `tests/finanzas.test.ts` (sin fotos → no hay acta; acta ajena rechazada; doble confirmación concurrente → una fila; parámetros incompletos → rechazo; en modo `eleccion` un pago de prueba previo no bloquea el cobro).

### M16 · Panel financiero básico
- **Archivos:** `src/server/finanzas-resumen.ts`, `src/app/api/admin/finanzas/resumen/route.ts`, panel en `src/app/admin/finanzas/page.tsx` (sondeo 5 s).
- **Contenido (§7.5, §13.9):** pagados, pendientes, documentación incompleta, total entregado EUR (solo `pagos_confirmados`); tabla por persona con estado (documentación incompleta / lista / acta preparada / pagada), EUR, hora, operador.
- **Criterio:** generar actas no cambia «pagados» ni el total; confirmar sí.
- **Pruebas:** `tests/finanzas-resumen.test.ts`.

### M17 · Publicar la primera versión en producción y ensayo en modo prueba
- **Pasos:** fusionar en `main`; desplegar; comprobar §3.5; confirmar que la banda MODO PRUEBA es visible; con un móvil real: superadmin → crear admin Madrid → cargar demo → crear operadores y enlaces de puerta, documentación, mando y finanzas → imprimir una hoja A4 → leer 3 credenciales en puerta → ver H/M en mando → aceptar una propuesta → subir fotos por `/d` → generar acta y confirmar pago simulado → ver el panel. Revisar a 375 px.
- **Criterio:** recorrido completo sin errores; anotar fallos de cámara/QR por modelo de móvil para M23.
- **Entrega:** URL y lista de comprobación al coordinador.

**▲ Fin de la primera versión en producción.** Todo lo registrado hasta «Preparar elección» (M19) queda etiquetado como prueba.

---

## Segunda tanda · Antes de datos reales y de la jornada (por prioridad)

| Tarea | Objetivo | Archivos | Criterio / pruebas |
| --- | --- | --- | --- |
| **M18 · 2FA superadmin** | TOTP + 10 códigos de recuperación (§14) | `src/domain/totp.ts`, `src/server/mfa.ts` (consulares, adaptados a `usuarios`/`codigos_recuperacion`), `src/app/superadmin/verificacion/` | Sin 2FA verificada en la sesión no se abre nada de `/superadmin`; código reutilizado rechazado. `tests/mfa.test.ts`. **Obligatoria antes de cargar el Excel real.** |
| **M19 · Borrar datos de prueba y preparar elección** | §8, §14.3 | `src/server/preparar-eleccion.ts`, pantalla en `/superadmin` | Algoritmo de 00 §8 (recuento, escribir `PREPARAR ELECCIÓN`, copia a `respaldo_limpieza` y recuento igual, borrado de actividad `es_prueba` y de `mjrv` de demo, `modo = 'eleccion'`, todo en una transacción). Conserva cuentas, operadores/PIN, enlaces, juntas, MJRV reales, parámetros. Repetir no borra nada. Antes, `pg_dump` manual (06 §5); si el respaldo falla, no se limpia. `tests/preparar-eleccion.test.ts`. |
| **M20 · Informe de cierre Madrid** | §13.9 | `src/server/pdf/informe.ts`, `src/app/admin/informes/` (PDF y Excel con `xlsx`) | Columnas de 02 §C.7, totales, hora de corte; sin fotos; solo confirmados en el total. |
| **M21 · Envío simulado de credenciales** | §7.1, §13.3 | `src/app/admin/credenciales` (botones WhatsApp/correo), `src/server/envios.ts` | Registra `envios_credencial` con `simulado = true`, estado «enviada al servicio (simulado)»; solo con teléfono/correo; no repite si ya hay uno. Ningún envío real. |
| **M22 · Inicio admin** | §13.1 | `src/app/admin/page.tsx` | Indicadores de §13.1 en dos bloques (apertura / pagos); sondeo 10 s. |
| **M23 · Captura automática** | §7.4 | `src/components/captura-cedula.tsx` | Dispara cuando la imagen está quieta y nítida ~1 s (varianza del laplaciano en `canvas`); botón manual siempre visible. Probado en iPhone y Android. |
| **M24 · Aviso de atención simultánea** | P-8 (PROPUESTA NO APROBADA) | `atenciones_finanzas` | Solo si Pablo lo aprueba; aviso no bloqueante. |
| **M25 · Matriz de permisos** | §16.1 | `tests/permisos.test.ts` | Cada ruta API y acción × cada tipo de sesión (ninguna, admin, superadmin, estación por función): permitido/denegado según §2. |

Después (fuera de este plan y solo con orden expresa de Pablo): envío real por WhatsApp/correo (P-3, P-4).

---

## 7. Preguntas nuevas para Pablo

**Q-R1 · Nombre del host de producción** (P-1 reducida a un host).
- **A.** `madrid.consulares.app`, si la zona `consulares.app` está en la misma cuenta de Cloudflare que el túnel.
- **B.** `cne.consulado.app` (zona ya operativa con el túnel de consulares).
- **C.** Otro nombre que indique Pablo.
**Recomendación:** B si A exige mover la zona de cuenta (no perder días con DNS). **Mientras tanto:** el host es la variable `HOST_MADRID`; el código no depende de él.

**Q-R2 · Si se usa la alternativa Render**, región de los datos: A Frankfurt (UE, datos personales y fotos de cédula de personas en España), B otra. **Recomendación:** A. Solo aplica si no está `ORACLE_SSH_KEY`.

**Q-R3 · Semántica de «No viable».** A: la persona sale de las propuestas hasta que el centro de mando la reactive (diseño actual). B: solo se descarta para ese destino. **Recomendación:** A (motivos «no responde / se niega / no está» son de la persona, no del destino).

Siguen abiertas de 05: P-5 (rótulo), P-6 (maqueta), P-7 (importe y fórmula), P-8, P-9, P-10, P-11, P-12, P-14.
