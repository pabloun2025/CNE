# 07 · Plan reducido: sistema operativo de Madrid (prevalece sobre 00–06)

**Estado:** 17-11-2026. Cambio de alcance decidido por Pablo: **solo Madrid** (§7, §7.1–7.5, «Mapa de juntas de Madrid», §13), **modo prueba y preparación de la elección** (§8, §14.2–14.3) aplicados a Madrid y **superadministración mínima** (§14.1). **No** se construyen el portal consular (§5, §11) ni el tablero DGSMH (§6, §12).
**Meta inmediata:** «versión de prueba 1» (VP1) publicada en Render cuanto antes. Pautas Karpathy: lo mínimo que cumple; cada tarea con criterio verificable.

---

## 1. Qué cambia respecto a 00–06

| Documento | Sigue valiendo | Queda sin efecto (o aplazado) |
| --- | --- | --- |
| 00 Arquitectura | Una app Next.js 16; sondeo JSON (mando 3 s, finanzas 5 s); `es_prueba` con `DEFAULT cne.en_prueba()`; limpieza con `respaldo_limpieza` en una transacción (§8 de 00); `pdf-lib` + `qrcode`; lector `BarcodeDetector` + `jsqr`; propuestas **deterministas**; interfaz (§12 de 00) | Separación **por host** y `HOST_*` → separación **por rutas** (§2 abajo). RLS por portal/consulado (`cne.portal`, `cne.consulado_id`). Trabajador y cola `trabajos`. Evolution/Brevo reales. Mapa mundial, terminador solar, husos horarios, borradores sin conexión. Despliegue en la VM (§3 de 00) → **aplazado**. |
| 01 Modelo de datos | Tablas de Madrid (con los cambios de §4 abajo); SQL de ingreso idempotente y pago atómico (§5 de 01); importador MJRV (§8 de 01) | Tablas consulares (`consulados`, `recintos`, `jrv`, `zonas_referencia_2026`, `reportes_hito*`, `votantes*`, `sin_novedades`, `tipos_incidencia`, `incidencias`, `incidencia_jrv`, `actuaciones_incidencia`, `solicitudes_apoyo`, `operaciones_recibidas`), `trabajos`, políticas RLS de §4 de 01, rol `cne_app` obligatorio. |
| 02 Pantallas | C.2–C.9 (estaciones, puerta, mando, documentos, finanzas, acta provisional, credencial CR80 y A4 10 por hoja) con rutas de §5 abajo | A (consular), B (DGSMH), D salvo lo mínimo de §5. `/documentos-qr` con token rotatorio → `/d` con interruptor abierto/cerrado. |
| 03 Reciclaje | Filas de `crypto.ts`, `passwords.ts`, `env.ts`, `db.ts` (reducido), `totp.ts`/`mfa.ts`, `door-scanner.tsx`, `door-feedback.ts`, `invitation-ticket.ts`, `live-board.tsx`, logotipo de la credencial | Filas de infraestructura Oracle/Cloudflare/CI, `jobs.ts`, `whatsapp.ts`/`evolution.ts`, `brevo.ts`, `phone.ts` (opcional) |
| 04 Plan | T01 (hecha) | Todo lo demás: lo sustituye este documento. T02 (Oracle) se conserva sin prioridad. |
| 05 Preguntas | P-5 a P-12 y P-14 | P-1, P-2, P-3, P-4, P-13, P-15, P-16, P-17 (fuera de alcance o aplazadas) |
| 06 Despliegue | — | Aplazado entero; lo sustituye §3 de este documento. |

---

## 2. Arquitectura reducida

- **Un host** (URL de Render). Rutas:

| Ruta | Quién | Sesión (cookie distinta, `httpOnly`, `sameSite=lax`, `secure`, `path=/`) |
| --- | --- | --- |
| `/admin/...` | Administración Madrid (correo + contraseña) | `cne_admin` → fila `sesiones` con usuario `madrid_admin` |
| `/superadmin/...` | Superadministración (contraseña; TOTP en M18) | `cne_super` → usuario `superadmin` |
| `/e/<token>` y `/e/<token>/trabajo` | Estación (puerta, documentación, mando, finanzas): nombre + PIN de 4 dígitos | `cne_estacion` → `sesiones_estacion` |
| `/d` | Formulario de documentos del QR genérico (público, limitado) | ninguna |
| `/api/salud` | Render (comprobación de salud) | ninguna |
| `/` | Redirige a `/admin` | — |

- **Barreras:** (1) cada layout, página, ruta API y Server Action llama a una guarda (`requireAdmin()`, `requireSuperadmin()`, `requireEstacion(funciones)`) que valida en servidor cookie → fila de sesión → tipo de usuario/función del enlace; (2) en PostgreSQL, **una sola** política RLS por tabla de actividad: `es_prueba = cne.en_prueba()` (ver §4). No hay RLS por portal: hay un solo ámbito (Madrid). La cookie de un tipo nunca vale para otro (la guarda comprueba el tipo, no solo que exista sesión).
- **Sin trabajador.** Lo que hacía el trabajador (envíos) es simulado y se registra en la propia petición (M21). `src/worker.ts` queda como está, sin uso en Render.
- **Fotos de cédula:** `bytea` cifrado AES-256-GCM con `APP_MASTER_KEY` (`src/server/crypto.ts` de consulares, tal cual). Cliente recorta a la proporción ID-1 y reduce a ≤ 1.600 px; servidor re-codifica con `sharp` (sin EXIF) a JPEG ≤ 1.200 px, calidad 75 (≈ 150–300 KB). Nunca hay URL pública: se sirven solo dentro del acta o a la administración/estación tras la guarda.
- **Zona horaria:** fija `Europe/Madrid` para mostrar horas; todo se guarda en `timestamptz`.

---

## 3. Despliegue en Render (prueba)

### 3.1 `render.yaml` (Blueprint, en la raíz)

```yaml
services:
  - type: web
    name: cne-madrid
    runtime: node
    plan: free
    region: frankfurt          # datos personales de residentes en España: región UE (ver Q-R2)
    branch: main
    autoDeploy: true
    buildCommand: npm ci && npm run build
    startCommand: npm run db:prepare && npm start
    healthCheckPath: /api/salud
    envVars:
      - key: NODE_VERSION
        value: "22"
      - key: NEXT_TELEMETRY_DISABLED
        value: "1"
      - key: DATABASE_URL
        fromDatabase:
          name: cne-madrid-db
          property: connectionString   # URL interna: sin SSL, solo dentro de Render
      - key: APP_MASTER_KEY
        sync: false                    # se pega a mano una vez: openssl rand -base64 32
      - key: SUPERADMIN_EMAIL
        sync: false
      - key: SUPERADMIN_PASSWORD_INICIAL
        sync: false

databases:
  - name: cne-madrid-db
    plan: free
    region: frankfurt
    databaseName: cne
    postgresMajorVersion: "16"
    ipAllowList: []                    # sin acceso externo
```

### 3.2 Variables de entorno

| Variable | Origen | Uso |
| --- | --- | --- |
| `DATABASE_URL` | Render (`fromDatabase`) | Única conexión. En Render no se crea `cne_app`: un solo rol (dueño). |
| `APP_MASTER_KEY` | A mano (`openssl rand -base64 32`), **no** `generateValue` | Cifrado de fotos y TOTP. La app se niega a arrancar si no decodifica a 32 bytes. **Si cambia, las fotos guardadas quedan ilegibles**: guardarla también fuera de Render (gestor de Pablo). |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD_INICIAL` | A mano | `db:prepare` crea la superadmin si no existe, con `debe_cambiar = true`. Si ya existe, no la toca. |
| `NODE_VERSION`, `NEXT_TELEMETRY_DISABLED` | Fijas | — |
| `APP_VERSION` | Opcional | `/api/salud` usa `APP_VERSION` o, si falta, `RENDER_GIT_COMMIT` (la pone Render). |

`DATABASE_OWNER_URL`, `HOST_*`, `EVOLUTION_*`, `BREVO_*`, `MAIL_*`, `*_REAL_SEND`, `POSTGRES_PASSWORD`, `CNE_APP_PASSWORD`: no se usan en Render. Si el código lee `DATABASE_OWNER_URL`, que caiga en `DATABASE_URL`.

### 3.3 Migraciones al arrancar

- El plan gratuito no tiene `preDeployCommand` ni consola: por eso `startCommand` = `npm run db:prepare && npm start`. Si `db:prepare` falla, la app no arranca y Render mantiene la versión anterior (la comprobación de salud no pasa).
- `scripts/prepare-db.ts`: toma `pg_advisory_lock(4242)`; aplica `db/schema.sql` si no existe el esquema `cne`; aplica en orden `db/migrations/*.sql` no registradas en `cne.migraciones(nombre, aplicada_en)`; siembra las 95 juntas (idempotente, `ON CONFLICT (serie, numero) DO NOTHING`); crea la superadmin desde variables si no existe. Todo idempotente.
- Los `GRANT ... TO cne_app` van envueltos en `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cne_app') THEN ... END IF; END $$;` para que el mismo esquema sirva en Render (sin `cne_app`) y más adelante en la VM.
- Cambios de esquema solo **aditivos** hasta el 30-11.

### 3.4 Comprobación de salud y publicación

- `GET /api/salud` → `SELECT 1` → `200 {"ok":true,"version":"…","base":"ok"}`; si la base falla → `503 {"ok":false}`. Sin datos personales.
- Tras cada despliegue: `/api/salud` 200; `/admin/acceso` 200; en la base, `SELECT count(*) FROM cne.juntas_madrid` = 95.
- Límites del plan gratuito a tener presentes: el servicio **se duerme tras 15 min sin tráfico** (primera petición ≈ 1 min); PostgreSQL gratuito con **1 GB** y **caducidad a los 30 días** de su creación; **sin copias automáticas**. Válido para pruebas; para la jornada, ver Q-R1.
- Los datos de demostración y las importaciones se lanzan desde la interfaz (no hay consola).

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
ALTER TABLE cne.<t> FORCE ROW LEVEL SECURITY;   -- en Render la app es la dueña de las tablas
CREATE POLICY modo ON cne.<t> USING (es_prueba = cne.en_prueba()) WITH CHECK (es_prueba = cne.en_prueba());
```

Seed de juntas (`db/seed/juntas-madrid.sql`): 95 filas exactamente según la tabla «Numeración de las fichas» (H1–21 amarillo, H22–41 azul, M1–8 rojo, M9–29 celeste, M30–39 verde, M40–54 rosado). `orden_cercania` por bloque (cadena del «Orden de los bloques»: celeste 1, rojo 2, azul 3, amarillo 4, verde 5, rosado 6; distancia = |a − b|; P-11 sigue abierta). Las juntas son maestras reales: `es_prueba = false`.

---

## 5. Pantallas (rutas finales)

- **Admin** `/admin`: `acceso`, `cambiar-contrasena`, `/` (inicio, M22), `mjrv`, `mjrv/importar`, `mjrv/nueva`, `mjrv/[id]`, `credenciales`, `operadores`, `mando`, `documentos` (interruptor «Formulario abierto/cerrado» + cartel A4 con QR a `<URL>/d`), `finanzas` (parámetros + panel), `informes` (M20). Menú lateral en escritorio, desplegable a 375 px.
- **Estación** `/e/[token]` (identificación) → `/e/[token]/trabajo` muestra la pantalla de su función (puerta, documentación, mando, finanzas). Sin menú a otras funciones (§13.10). Cabecera: función · operador · conexión · «Cambiar operador».
- **Superadmin** `/superadmin`: `acceso`, `cambiar-contrasena`, `/` con: cuentas de admin Madrid (alta, contraseña temporal, desactivar), «Modo prueba» (conmutador), «Cargar datos de demostración» (solo en modo prueba), y en VP2 «Borrar datos de prueba y preparar para elección» y 2FA.
- **Banda MODO PRUEBA** roja fija en todas las pantallas (admin, estación, `/d`, superadmin) cuando `modo = 'prueba'`.

---

## 6. Tareas

Convenciones para cada tarea: comentarios en español; `npx tsc --noEmit -p .`, `npm run lint`, `npm test`, `npm run build` en verde; pantallas revisadas a 375 px. Pruebas de base contra `DATABASE_TEST_URL` (PostgreSQL 16 local). Un commit por tarea («M0n · …»).

### Antes de empezar (T02)
Hacer commit de los archivos de T02 **tal cual** en un commit propio («T02 · Compose y script para la VM Oracle (aplazado)»), excepto `scripts/prepare-db.ts` y `src/worker.ts`, que se incluyen también (M02 reescribe `prepare-db.ts`). No dedicar más tiempo a Oracle.

---

## ▶ VERSIÓN DE PRUEBA 1 (M01–M17)

### M01 · Render: esqueleto publicado con base
- **Objetivo:** que `main` se publique sola en Render con base conectada, antes de construir nada más.
- **Archivos:** `render.yaml` (§3.1), `package.json` (`"start": "next start --hostname 0.0.0.0 --port ${PORT:-38473}"`), `src/server/db.ts` (pool único `pg` desde `DATABASE_URL`, `search_path=cne,public`, `withTx(fn)`; copiado de `consulares/src/server/db.ts` y reducido), `src/server/env.ts` (de consulares), `src/app/api/salud/route.ts`, `.env.example` (quitar `HOST_*`; dejar `DATABASE_URL`, `DATABASE_TEST_URL`, `APP_MASTER_KEY`, `SUPERADMIN_*`), borrar `src/app/p/*`, nueva `src/app/page.tsx` (redirige a `/admin`) y `src/app/admin/page.tsx` provisional.
- **Criterio:** el coordinador crea el Blueprint; `https://<servicio>.onrender.com/api/salud` → 200 con `base: "ok"`.
- **Pruebas:** `tests/salud.test.ts` actualizada: 200 con base disponible; 503 si `DATABASE_URL` apunta a un puerto cerrado; `version` toma `RENDER_GIT_COMMIT` si falta `APP_VERSION`.

### M02 · Esquema, migraciones al arrancar y 95 juntas
- **Archivos:** `db/schema.sql` (§4), `db/seed/juntas-madrid.sql`, `db/migrations/.gitkeep`, `scripts/prepare-db.ts` (§3.3), `src/server/crypto.ts` y `src/server/passwords.ts` (consulares, tal cual), `src/domain/juntas.ts` (tipos, colores de zona, `etiquetaJunta('H',12) = 'H12'`).
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
- **Nota:** el estado inicial es `prueba`. Pasar a `eleccion` sin limpiar es posible pero la limpieza llega en M19; en VP1 el superadmin lo deja en `prueba`.

### M05 · Datos de demostración
- **Archivos:** `src/domain/demo.ts` (genera filas puras), `src/server/demo.ts`, botón en `/superadmin` («Cargar datos de demostración», solo en modo prueba; «Quitar datos de demostración» borra `mjrv` con `es_prueba = true` y su actividad).
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
- **Reglas:** `/d` solo funciona si `documentos_publico_abierto`; muestra el mínimo («J. P., junta H12») y pide confirmar; 10 consultas por IP cada 15 min (primera IP de `X-Forwarded-For`); rechaza imagen < 20 KB o > 2 MB y reverso idéntico al anverso (sha256); el público no vuelve a ver las fotos. La estación de documentación (con PIN) ve el nombre completo y puede sustituir fotos. **Captura automática: M23** (VP2).
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

### M17 · Publicar VP1 y ensayo en Render
- **Pasos:** fusionar en `main`; comprobar §3.4; con un móvil real: superadmin → crear admin Madrid → cargar demo → crear operadores y enlaces de puerta, documentación, mando y finanzas → imprimir una hoja A4 → leer 3 credenciales en puerta → ver H/M en mando → aceptar una propuesta → subir fotos por `/d` → generar acta y confirmar pago simulado → ver el panel. Revisar a 375 px.
- **Criterio:** recorrido completo sin errores; anotar fallos de cámara/QR por modelo de móvil para M23.
- **Entrega:** URL y lista de comprobación al coordinador.

**▲ Fin de la versión de prueba 1.**

---

## VP2 · Antes de datos reales y de la jornada (por prioridad)

| Tarea | Objetivo | Archivos | Criterio / pruebas |
| --- | --- | --- | --- |
| **M18 · 2FA superadmin** | TOTP + 10 códigos de recuperación (§14) | `src/domain/totp.ts`, `src/server/mfa.ts` (consulares, adaptados a `usuarios`/`codigos_recuperacion`), `src/app/superadmin/verificacion/` | Sin 2FA verificada en la sesión no se abre nada de `/superadmin`; código reutilizado rechazado. `tests/mfa.test.ts`. **Obligatoria antes de cargar el Excel real.** |
| **M19 · Borrar datos de prueba y preparar elección** | §8, §14.3 | `src/server/preparar-eleccion.ts`, pantalla en `/superadmin` | Algoritmo de 00 §8 (recuento, escribir `PREPARAR ELECCIÓN`, copia a `respaldo_limpieza` y recuento igual, borrado de actividad `es_prueba` y de `mjrv` de demo, `modo = 'eleccion'`, todo en una transacción). Conserva cuentas, operadores/PIN, enlaces, juntas, MJRV reales, parámetros. Repetir no borra nada. Además, botón previo «Descargar respaldo» (JSON de las filas a borrar), porque el plan gratuito no tiene copias. `tests/preparar-eleccion.test.ts`. |
| **M20 · Informe de cierre Madrid** | §13.9 | `src/server/pdf/informe.ts`, `src/app/admin/informes/` (PDF y Excel con `xlsx`) | Columnas de 02 §C.7, totales, hora de corte; sin fotos; solo confirmados en el total. |
| **M21 · Envío simulado de credenciales** | §7.1, §13.3 | `src/app/admin/credenciales` (botones WhatsApp/correo), `src/server/envios.ts` | Registra `envios_credencial` con `simulado = true`, estado «enviada al servicio (simulado)»; solo con teléfono/correo; no repite si ya hay uno. Ningún envío real. |
| **M22 · Inicio admin** | §13.1 | `src/app/admin/page.tsx` | Indicadores de §13.1 en dos bloques (apertura / pagos); sondeo 10 s. |
| **M23 · Captura automática** | §7.4 | `src/components/captura-cedula.tsx` | Dispara cuando la imagen está quieta y nítida ~1 s (varianza del laplaciano en `canvas`); botón manual siempre visible. Probado en iPhone y Android. |
| **M24 · Aviso de atención simultánea** | P-8 (PROPUESTA NO APROBADA) | `atenciones_finanzas` | Solo si Pablo lo aprueba; aviso no bloqueante. |
| **M25 · Matriz de permisos** | §16.1 | `tests/permisos.test.ts` | Cada ruta API y acción × cada tipo de sesión (ninguna, admin, superadmin, estación por función): permitido/denegado según §2. |

Después (fuera de este plan): envío real por WhatsApp/correo (P-3, P-4), VM Oracle (T02–T04 de 04).

---

## 7. Preguntas nuevas para Pablo

**Q-R1 · Dónde corre el día 29.** Render gratuito se duerme tras 15 min sin uso, no tiene copias y su base caduca a los 30 días.
- **A.** Pasar a planes de pago de Render antes del 27-11 (servicio web sin suspensión + PostgreSQL con copias); mismo `render.yaml` cambiando `plan`.
- **B.** Volver a la VM Oracle (T02 ya preparado) tras las pruebas.
- **C.** Seguir en gratuito (no recomendado: arranque en frío de ≈ 1 min en puerta y sin copias).
**Recomendación:** A (sin cambiar de plataforma a 2 días de la jornada). **Mientras tanto:** gratuito para VP1.

**Q-R2 · Región de los datos.** Se propone `frankfurt` (UE) por tratarse de datos personales y fotos de cédula de personas en España. A: Frankfurt. B: otra región que indique Pablo. **Recomendación:** A. Cambiarla después exige recrear la base.

**Q-R3 · Semántica de «No viable».** A: la persona sale de las propuestas hasta que el centro de mando la reactive (diseño actual). B: solo se descarta para ese destino. **Recomendación:** A (motivos «no responde / se niega / no está» son de la persona, no del destino).

Siguen abiertas de 05: P-5 (rótulo), P-6 (maqueta), P-7 (importe y fórmula), P-8, P-9, P-10, P-11, P-12, P-14.
