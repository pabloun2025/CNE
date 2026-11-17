# 04 · Plan de construcción

Para el agente programador (`cne-programador`, Sonnet). Seguir **en orden** salvo donde se indica que dos hitos pueden ir en paralelo. Cada tarea cabe en medio día o menos. Al terminar cada tarea: `npx tsc --noEmit -p .`, `npm run lint`, `npm test` (y `npm run build` si tocó páginas); commit en español con el número de tarea («T07 · …»). Las pantallas se revisan a 375 px.

**Reglas que aplican a todas las tareas**
- Leer antes `00`–`03` de este directorio. Pautas Karpathy: lo mínimo que cumple; nada no pedido.
- Next.js 16: tras `npm install`, leer `node_modules/next/dist/docs/` (proxy, rutas, server actions). `proxy.ts`, `params` como `Promise`, `cookies()`/`headers()` asíncronos.
- Toda consulta de negocio por `withPortal`. Toda ruta/acción empieza con `requirePortal` o `requireEstacion`.
- Lógica de reglas en `src/domain/` (pura, con pruebas unitarias). Acceso a datos en `src/server/`.
- No inventar datos. Demostración solo con `scripts/demo-data.ts` (nombres «PRUEBA», cédulas `00000000NN`).
- Nunca envío real en pruebas. `WHATSAPP_REAL_SEND` y `EMAIL_REAL_SEND` ausentes = simulado.
- Pruebas de base contra `cne_test` (`DATABASE_TEST_URL`); cada archivo de prueba recrea el esquema con `applySchema(fresh)`.

## Calendario de hitos

| Hito | Contenido | Tareas | Fecha objetivo |
| --- | --- | --- | --- |
| **H0** | Fundación: esqueleto desplegado en la VM | T01–T04 | mié 18-11 |
| **H1** | Esquema, accesos por portal, superadmin 2FA, modo prueba, importadores, demo | T05–T13 | vie 20-11 |
| **H2** | Madrid preparación: MJRV, credenciales PDF/A4, operadores/PIN, puerta, envíos | T14–T21 | dom 22-11 (credenciales imprimibles); envíos en cuanto llegue el Excel real |
| **H3** | Portal consular completo | T22–T28 | lun 23-11 |
| **H4** | Tablero DGSMH: mapa, capa solar, alertas, incidencias, informes | T29–T36 | mié 25-11 |
| **H5** | Madrid operación: centro de mando, documentos, finanzas, actas, panel e informe | T37–T45 | jue 26-11 |
| **H6** | Matriz de permisos, preparar elección, copias, ensayo general, datos reales | T46–T51 | sáb 28-11 (preparar elección la noche del 28) |

Paralelismo posible tras H1: **H2 y H3** en sesiones distintas (no comparten archivos salvo `db/migrations`: cada sesión crea su propia migración con fecha y sufijo distinto). H4 necesita H3; H5 necesita H2.

Total: **51 tareas** (H0 4 · H1 9 · H2 8 · H3 7 · H4 8 · H5 9 · H6 6).

---

## H0 · Fundación (18-11)

### T01 · Esqueleto Next.js desplegable
- **Objetivo:** app vacía que construye, arranca en 38473 y responde `/api/salud`, con una página «En construcción» por portal.
- **Archivos:** `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/api/salud/route.ts`, `src/app/p/{consular,dgsmh,madrid,admin}/page.tsx`, `src/proxy.ts` (provisional: solo cabeceras), `Dockerfile`, `.dockerignore`, `.gitignore`, `.env.example`.
- **Pasos:** 1) dependencias de 00 §2 (versiones de consulares/teinvito); 2) scripts `dev` (`next dev --hostname 0.0.0.0 --port 38473`), `start`, `build`, `lint`, `test` (`vitest run`), `worker`, `db:prepare`, `db:demo`; 3) Dockerfile de consulares adaptado (03); 4) `/api/salud` sin base todavía devuelve `{ok:true, version}` (`VERSION` de variable de entorno `APP_VERSION`, por defecto «dev»).
- **Criterio:** `npm run build` sin errores; `docker build .` termina; `curl localhost:38473/api/salud` → 200.
- **Pruebas:** `tests/salud.test.ts` llama al handler y espera 200.

### T02 · Compose de producción y script de despliegue
- **Objetivo:** `docker-compose.oracle.yml` + `scripts/deploy-oracle.sh` + `docker/` listos para la VM, sin tocar contenedores ajenos.
- **Archivos:** `docker-compose.oracle.yml`, `scripts/deploy-oracle.sh`, `docker/postgres-init.sh`, `docker/backup.sh`.
- **Pasos:** seguir 03 (filas de infraestructura) y `06`. Servicios `cne-postgres`, `cne-migrate`, `cne-app`, `cne-worker`, `cne-backup`; red `cne_interna` + externa `citas-prod_interna` (solo app/worker, alias `cne-app`); `DATABASE_URL=postgres://cne_app:${CNE_APP_PASSWORD}@cne-postgres:5432/cne`; `EVOLUTION_API_URL=http://evolution-api:8080`. El script: genera `.env.production` conservando valores existentes (si `APP_MASTER_KEY` del paquete difiere de la del servidor, se detiene con error); `pg_dump` previo si `cne-postgres` está en marcha (guarda los 5 últimos en `backups/pre-despliegue/`); `docker tag cne:local cne:anterior` si existe; `build`; `up -d cne-postgres`; `run --rm cne-migrate`; `up -d cne-app cne-worker cne-backup`; espera salud; `docker image prune -f`; `docker builder prune -f --filter until=72h`. Acción `revertir`: `docker tag cne:anterior cne:local && up -d --no-build cne-app cne-worker`.
- **Criterio:** `docker compose -f docker-compose.oracle.yml --env-file .env.example config --quiet` correcto; `bash -n scripts/deploy-oracle.sh`; ningún servicio se llama `app`, `postgres` ni `worker`; `grep -n remove-orphans` vacío.
- **Pruebas:** `tests/compose.test.ts` lee el YAML (con `yaml` de devDependency o regex) y comprueba nombres `cne-*` y que `cne-postgres` no está en `citas-prod_interna`.

### T03 · Flujos de GitHub Actions (CI, despliegue, dominio)
- **Objetivo:** desplegar con un clic desde GitHub; añadir hostnames al túnel.
- **Archivos:** `.github/workflows/ci.yml`, `.github/workflows/oracle-deploy.yml`, `.github/workflows/dominio.yml`, `scripts/cloudflare-dominio.py`.
- **Pasos:** copiar y adaptar según 03. `oracle-deploy.yml`: `workflow_dispatch` con entrada `accion` (desplegar/revertir); job `ci` reutilizado; job `deploy`: escribe JSON temporal con `APP_MASTER_KEY`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD_INICIAL`, `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME`, `EVOLUTION_INSTANCE`, `APP_VERSION=${{ github.sha }}`, hosts; tar sin `.git`, `node_modules`, `backups`; scp; ejecuta `deploy-oracle.sh`; borra temporales siempre. `dominio.yml`: entradas `accion` (comprobar/crear) y `hosts` (lista separada por comas).
- **Criterio:** `actionlint` (si está disponible) o revisión: ningún secreto se imprime (`set +x`, sin `echo` de variables); el flujo de inspección existente no se modifica.
- **Pruebas:** CI verde en la rama. **Pablo** (o el coordinador con su permiso) ejecuta `oracle-inspect.yml` y apunta en `06` la memoria/disco libres.

### T04 · Primer despliegue del esqueleto
- **Objetivo:** el esqueleto corre en la VM y se ve por un hostname.
- **Pasos:** requisitos de `06` §2 (secretos cargados, inspección hecha, P-1 respondida o host provisional); ejecutar `dominio.yml` (comprobar → crear); ejecutar `oracle-deploy.yml`.
- **Criterio:** `https://<HOST_CONSULAR>/api/salud` → 200 con la versión; `docker ps` muestra los `cne-*` y los contenedores de consulares/teinvito con el mismo tiempo en marcha que antes (no reiniciados).
- **Pruebas:** registro del flujo; captura de `docker compose -p cne-prod ps`.

## H1 · Accesos, datos base y modo prueba (19–20-11)

### T05 · Esquema base y migraciones
- **Objetivo:** `db/schema.sql` completo de `01` §2–§4, aplicador y preparación de base.
- **Archivos:** `db/schema.sql`, `db/migrations/.gitkeep`, `db/seed/juntas-madrid.sql`, `db/seed/zonas-referencia-2026.sql` (generado desde `insumos/2026/*.csv`), `src/server/env.ts`, `src/server/db.ts` (`getAppPool`, `getAdminPool`, `withPortal`, `withOwner`), `src/server/schema-apply.ts`, `scripts/prepare-db.ts`, `scripts/setup-test-db.ts`, `docker-compose.yml` (local: postgres 16 con `cne_owner`, `cne_app`, base `cne` y `cne_test`).
- **Pasos:** copiar de consulares (03); `prepare-db.ts`: aplica esquema/migraciones, siembra 95 juntas y zonas de referencia de forma idempotente (`ON CONFLICT DO NOTHING`), crea superadmin inicial si no existe ninguno (`debe_cambiar = true`). `/api/salud` pasa a hacer `SELECT 1`.
- **Criterio:** `npm run db:prepare` dos veces seguidas sin error; `SELECT count(*) FROM cne.juntas_madrid` = 95 (41 H, 54 M; colores según la tabla de la especificación); `zonas_referencia_2026` = 10 filas.
- **Pruebas:** `tests/db/esquema.test.ts`: (a) sin `withPortal`, `SELECT * FROM recintos` como `cne_app` devuelve 0 filas aunque existan; (b) `withPortal('consular', A)` no ve recintos de B; (c) `withPortal('dgsmh')` no ve `mjrv`; (d) en modo elección un `INSERT` en `lecturas_puerta` queda con `es_prueba = false` y en modo prueba con `true`; (e) seed de juntas: H1–21 amarillo, H22–41 azul, M1–8 rojo, M9–29 celeste, M30–39 verde, M40–54 rosado.

### T06 · Separación por host (`proxy.ts`) y guardas
- **Objetivo:** cada host sirve solo su portal (00 §4).
- **Archivos:** `src/domain/portal.ts`, `src/proxy.ts`, `src/server/guard.ts`, `src/server/hosts.ts`.
- **Pasos:** `portalDeHost(host)` con `HOST_CONSULAR/DGSMH/MADRID/ADMIN` (quita puerto, minúsculas); `proxy`: `/api/salud` pasa siempre; host desconocido → 404; ruta que empieza por `/p/` → 404; `/api/<x>/…` con `x` ≠ portal del host → 404; resto → `rewrite` a `/p/<portal><ruta>`; cabeceras de seguridad. `requirePortal(portal, tipos)` recalcula el portal desde `headers().get('host')` y lanza `notFound()` si no coincide.
- **Criterio:** en local, `curl -H 'Host: control.localhost' localhost:38473/api/madrid/x` → 404; `curl -H 'Host: cne.localhost' localhost:38473/p/dgsmh` → 404.
- **Pruebas:** `tests/portal.test.ts` (tabla de casos host/ruta → portal/404).

### T07 · Acceso con contraseña para consulado, DGSMH y admin Madrid
- **Objetivo:** login, cambio obligatorio de contraseña, cierre de sesión y límites de intentos.
- **Archivos:** `src/server/auth.ts`, `src/server/passwords.ts`, `src/server/crypto.ts`, `src/domain/password-policy.ts`, `src/domain/text.ts`, `src/server/auditoria.ts`, `src/components/formulario-acceso.tsx`, páginas `acceso` y `cambiar-contrasena` en `p/consular`, `p/dgsmh`, `p/madrid` (comparten componente).
- **Pasos:** login comprueba que `usuarios.tipo` corresponde al portal del host (`consulado`↔consular, `dgsmh`↔dgsmh, `madrid_admin`↔madrid); sesión 16 h con `token_hash = sha256(token)`; cookie `cne_sesion` sin `Domain`; `debe_cambiar` redirige a cambiar contraseña; límites de 00 §5; auditoría de fallos.
- **Criterio:** C-01; una cuenta DGSMH no puede entrar en el host consular (mensaje genérico); 31 intentos desde una IP → bloqueados 15 min.
- **Pruebas:** `tests/db/auth.test.ts` (tipo↔portal, cambio obligatorio, límite, sesión revocada → redirección).

### T08 · Superadmin con 2FA
- **Objetivo:** portal admin solo con contraseña + TOTP.
- **Archivos:** `src/domain/totp.ts` (copiado), `src/server/mfa.ts`, `p/admin/{acceso,verificacion,alta-2fa,cambiar-contrasena,page}.tsx`.
- **Pasos:** primer acceso → cambio de contraseña → alta de 2FA (QR con `qrcode` como data URL, 8 códigos de recuperación mostrados una vez) → `sesiones.mfa_verificada = true`. `requirePortal('admin')` exige `mfa_verificada`.
- **Criterio:** sin código válido no se ve ninguna página de admin (prueba con `curl` y cookie a medio verificar → redirección a `/verificacion`).
- **Pruebas:** `tests/totp.test.ts` (vectores RFC 6238 de consulares), `tests/db/mfa.test.ts`.

### T09 · Modo prueba visible y conmutador
- **Objetivo:** banda «MODO PRUEBA» en los cuatro portales; interruptor en admin.
- **Archivos:** `src/server/configuracion.ts`, `src/components/banda-modo.tsx`, `src/app/layout.tsx`, `p/admin/modo/page.tsx`.
- **Pasos:** el layout raíz lee `configuracion.modo` (consulta barata, sin caché); interruptor con confirmación escrita y auditoría.
- **Criterio:** S-01 (cambiar a prueba → la banda aparece en los cuatro hosts al recargar).
- **Pruebas:** `tests/db/modo.test.ts` (cambio registrado en auditoría; solo superadmin).

### T10 · Importador de catálogo consular
- **Objetivo:** cargar consulados/recintos/JRV desde Excel o CSV con vista previa e informe (01 §8).
- **Archivos:** `src/domain/importacion/catalogo.ts` (mapeo de columnas + validación pura), `src/domain/zona-horaria.ts` (`zonaValida(z)` con `Intl.supportedValuesOf('timeZone')`), `src/server/admin/importar-catalogo.ts`, `p/admin/catalogo/{page,importar/page}.tsx`, `public/plantillas/catalogo.xlsx` (generada por `scripts/plantillas.ts`), `scripts/importar-catalogo.ts` (misma lógica por línea de comandos, para la primera carga, §3).
- **Pasos:** lectura con `xlsx`; normalización (trim, mayúsculas en códigos); errores/advertencias de 01 §8; «Aplicar» con `withOwner` en una transacción, upsert por `codigo`, `es_prueba = false`; ausentes → lista para dar de baja.
- **Criterio:** archivo de ejemplo con errores → vista previa con nº de fila y motivo, nada guardado; archivo correcto → recuentos coinciden; recinto «Caracas» → advertencia «zona SUSPENDIDA_VOTACION_2026 (fuente CNE 21-10-2026)».
- **Pruebas:** `tests/importacion-catalogo.test.ts` (puras: duplicados, referencias rotas, zona inválida, cerrada/suspendida); `tests/db/importar-catalogo.test.ts` (idempotencia: importar dos veces no duplica).

### T11 · Cuentas: importación consular y gestión
- **Objetivo:** cuentas consulares desde Excel; alta de DGSMH y admin Madrid; restablecer contraseñas.
- **Archivos:** `src/domain/importacion/cuentas.ts`, `src/server/admin/cuentas.ts`, `p/admin/cuentas/page.tsx`, `scripts/importar-cuentas.ts`.
- **Pasos:** contraseña temporal del archivo → hash; nunca se registra ni se devuelve en claro; restablecer genera una temporal aleatoria (12 caracteres legibles) mostrada una sola vez.
- **Criterio:** importar cuentas → login en host consular → cambio obligatorio; restablecer invalida sesiones abiertas.
- **Pruebas:** `tests/db/cuentas.test.ts`.

### T12 · Tipos de incidencia y parámetros de alertas
- **Objetivo:** importar catálogo de incidencias (cuando exista) y fijar margen de alertas (vacío por defecto).
- **Archivos:** `src/domain/importacion/tipos-incidencia.ts`, `p/admin/incidencias-tipos/page.tsx`, `p/admin/parametros/page.tsx`.
- **Criterio:** sin catálogo, el formulario consular ofrece solo «Otro» (se verifica en T26); margen vacío desactiva alertas (T33).
- **Pruebas:** `tests/importacion-tipos.test.ts`.

### T13 · Datos de demostración
- **Objetivo:** poder probar todo sin datos reales, con datos evidentemente ficticios.
- **Archivos:** `scripts/demo-data.ts`.
- **Pasos:** con `withOwner`, `es_prueba = true` en maestros: 3 consulados «CONSULADO PRUEBA 1/2/3» (zonas `Europe/Madrid`, `America/New_York`, `Asia/Tokyo`; coordenadas aproximadas de esas ciudades marcadas `ubicacion_aproximada`), 5 recintos «RECINTO PRUEBA n», 40 JRV; cuentas `prueba1@cne.invalid`… con contraseña impresa en consola; 1 DGSMH y 1 admin Madrid de prueba; 380 MJRV «APELLIDO PRUEBA 001 / NOMBRE PRUEBA 001», cédulas `0000000001`… repartidas 4 por junta (presidente, secretario, vocal, suplente) — **no** modifica `juntas_madrid` (son maestros reales); 4 tipos de incidencia «TIPO DE PRUEBA n»; 2 operadores Madrid («OPERADOR PRUEBA A/B», PIN impreso) y un enlace por función (URL impresa). Idempotente.
- **Criterio:** tras `npm run db:demo`, se puede entrar en los cuatro portales con lo impreso.
- **Pruebas:** `tests/db/demo.test.ts` (todos los maestros creados tienen `es_prueba = true`).

## H2 · Madrid preparación (20–22-11) — puede ir en paralelo con H3

### T14 · MJRV: importación, lista y ficha
- **Objetivo:** cargar el Excel de MJRV con validación y administrar fichas (§7.1, §13.2).
- **Archivos:** `src/domain/cedula.ts` (`normalizarCedula`, `verificadorEcuatoriano`), `src/domain/importacion/mjrv.ts` (mapeo; `rolDesdeCargo(texto)`: PRESIDENTE→presidente, SECRETARI→secretario, VOCAL→vocal, SUPLENTE→suplente, resto→otro), `src/server/madrid/mjrv.ts`, `p/madrid/{page,mjrv/page,mjrv/importar/page,mjrv/[id]/page}.tsx`, `scripts/importar-mjrv.ts`.
- **Pasos:** validaciones de 01 §8; alta/edición/baja individual con auditoría; la baja pone `activo=false` y motivo.
- **Criterio:** M-01 (duplicados y conflictos señalados por fila; nada se guarda si hay errores); cédula `912345678` → `0912345678` con advertencia.
- **Pruebas:** `tests/cedula.test.ts`, `tests/importacion-mjrv.test.ts`, `tests/db/mjrv.test.ts` (reimportación actualiza por cédula, no duplica).

### T15 · Credencial individual CR80
- **Objetivo:** PDF de una credencial según 02 §C.9.
- **Archivos:** `public/marca/cne-elecciones-2027.jpg` (extraído, ver 03), `src/domain/credencial-layout.ts` (medidas en mm → pt, `ajustarTexto(texto, anchoMax, tamMax, tamMin)`), `src/domain/rotulo.ts` (`rotuloCredencial(junta, mjrv)`: si `mjrv.es_prueba` → `serie+numero` (solo demo); si no, `junta.rotulo_credencial` o `null` → bloqueo «Falta el rótulo», P-5), `src/server/pdf/credencial.ts` (`renderCredencial(datos): Uint8Array`), `src/app/p/madrid/api…` → ruta `GET /api/madrid/credenciales/[mjrvId]/pdf`.
- **Pasos:** pdf-lib, Helvetica/Helvetica-Bold, `latin()` de teinvito; QR con `qrcode.toBuffer(cedula, {errorCorrectionLevel:'M', margin:1, width:400})`; pictogramas con `drawSvgPath` (dos trazados simples hombre/mujer); en modo prueba franja «PRUEBA».
- **Criterio:** M-02: el PDF mide 153,07 × 242,65 pt; el QR del PDF renderizado decodifica la cédula; nombres largos no se salen del recuadro.
- **Pruebas:** `tests/credencial.test.ts`: renderiza, rasteriza con `pdftoppm` si está disponible o comprueba con `pdf-lib` el tamaño de página; decodifica el QR generado (`jsqr` sobre el PNG del QR antes de incrustarlo); `ajustarTexto` con 60 caracteres.

### T16 · Hoja A4 de credenciales y selección
- **Objetivo:** A4 con 10 credenciales giradas y líneas de corte; pantalla de selección.
- **Archivos:** `src/server/pdf/credencial.ts` (`renderHojasA4(lista)`), `p/madrid/credenciales/page.tsx`, ruta `POST /api/madrid/credenciales/a4` (ids) → PDF.
- **Pasos:** cada credencial se renderiza en un PDF de una página y se incrusta con `embedPage` + `drawPage({rotate: degrees(90)})` en una cuadrícula 2 × 5 (02 §C.9); marca `credencial_generada_en`.
- **Criterio:** M-03: 23 credenciales → 3 páginas (10+10+3); ningún elemento fuera del área imprimible (márgenes ≥ 13 mm).
- **Pruebas:** `tests/credencial-a4.test.ts` (nº de páginas; posiciones calculadas dentro de la página).

### T17 · Operadores, PIN y enlaces de estación
- **Objetivo:** alta de operadores con PIN y enlaces revocables; entrada `/e/[token]` (02 §C.2).
- **Archivos:** `src/server/estacion.ts` (`crearEnlace`, `revocarEnlace`, `entrarEstacion`, `requireEstacion(funciones)`), `p/madrid/operadores/page.tsx`, `p/madrid/e/[token]/{page,trabajo/page}.tsx`, `src/components/teclado-pin.tsx`.
- **Pasos:** token 32 bytes (`randomToken`), se guarda hash y copia cifrada (para «Ver QR»); PIN argon2; límites de 00 §5; cookie `cne_estacion` 16 h; `requireEstacion` comprueba enlace activo, operador activo y función.
- **Criterio:** M-05; revocar un enlace expulsa a sus estaciones en la siguiente petición; 5 PIN erróneos bloquean al operador 15 min.
- **Pruebas:** `tests/db/estacion.test.ts`.

### T18 · Puerta
- **Objetivo:** lectura de QR con resultado, sonido e idempotencia (02 §C.3).
- **Archivos:** `src/components/lector-qr.tsx`, `src/components/sonidos.ts` (copiados de teinvito, 03), `p/madrid/e/[token]/trabajo/puerta.tsx`, `src/server/madrid/puerta.ts`, ruta `POST /api/madrid/puerta` `{codigo, dispositivo}`.
- **Pasos:** SQL de 01 §5; respuesta `{resultado, titulo, detalle, junta}`; contador por puesto.
- **Criterio:** M-06, M-07; dos peticiones simultáneas con la misma cédula → un `valido` y un `duplicado`.
- **Pruebas:** `tests/db/puerta.test.ts` (válido, duplicado, desconocido, baja→bloqueado, concurrencia con `Promise.all`).

### T19 · Cola de trabajos y trabajador
- **Objetivo:** `src/worker.ts` procesa envíos con pausa y modo simulado.
- **Archivos:** `src/server/trabajos.ts` (copiado y reducido de teinvito), `src/worker.ts`, `src/server/envios/evolution.ts`, `src/server/envios/brevo.ts`.
- **Pasos:** bucle con `claim` `FOR UPDATE SKIP LOCKED`; reintentos 3 con espera creciente; ventana 08:00–21:00 Madrid para WhatsApp; pausa aleatoria 20–45 s entre WhatsApp reales (2 s en simulado); actualiza `envios_credencial`.
- **Criterio:** en simulado, 10 envíos encolados quedan `enviada_al_servicio` con `simulado = true` en < 1 min.
- **Pruebas:** `tests/db/trabajos.test.ts` (dos trabajadores no toman el mismo trabajo; error → `fallo` con motivo tras 3 intentos; `fetch` simulado).

### T20 · Envío de credenciales por WhatsApp y correo
- **Objetivo:** encolar envíos desde la selección y ver su estado (§13.3).
- **Archivos:** `src/server/madrid/envios.ts`, `p/madrid/{credenciales,envios}/page.tsx`, texto fijo en `src/domain/textos-envio.ts` («Su credencial de miembro de junta receptora del voto para el 29 de noviembre. Preséntela en la entrada.» — revisable por Pablo).
- **Criterio:** M-04 (fallo simulado → «Falló el envío: motivo», nunca «entregada»); no se encola dos veces el mismo canal si hay uno en cola.
- **Pruebas:** `tests/db/envios.test.ts`.

### T21 · Inicio del admin Madrid
- **Objetivo:** resumen de §13.1 con sondeo 10 s.
- **Archivos:** `src/server/madrid/resumen.ts`, ruta `GET /api/madrid/resumen`, `p/madrid/page.tsx`, `src/components/sondeo.ts`.
- **Criterio:** recuentos coinciden con consultas directas en la prueba.
- **Pruebas:** `tests/db/resumen-madrid.test.ts`.

## H3 · Portal consular (21–23-11) — puede ir en paralelo con H2

### T22 · Reglas de fase y hora local (dominio puro)
- **Objetivo:** una única fuente de verdad para habilitar hitos (§11.4).
- **Archivos:** `src/domain/hora-local.ts` (`horaLocal(zona, ahora)` → `{fecha, hora, minuto}` con `Intl.DateTimeFormat`), `src/domain/fases.ts` (`HITOS`, `FASES`, `faseDeHito`, `evaluarHito({hito, estadosJrv, zona, ahora, modo}) → {habilitado, motivos[]}`, `faseVigente(...)`).
- **Reglas:** modo prueba → siempre habilitado; modo elección → (a) el hito anterior está `completada` para esa JRV («Falta confirmar <hito anterior> de esta junta»); (b) para `inicio_escrutinio`: zona horaria presente («Falta la zona horaria del recinto») y `ahora_local >= 2026-11-29 19:00` («Disponible desde las 19:00, hora local»). Correcciones a `pendiente`/`sin_informacion` siempre permitidas.
- **Criterio / Pruebas:** `tests/fases.test.ts`: 18:59 en Madrid bloquea y 19:00 habilita; misma hora UTC habilita Tokio y bloquea Nueva York; JRV sin cierre bloqueada aunque sean las 20:00 (C-11); modo prueba ignora todo (C-12); fecha 28-11 a las 20:00 bloquea.

### T23 · Sesión consular: operador, teléfono, recinto
- **Archivos:** `src/server/consular/sesion.ts`, `p/consular/{operador,telefono,recinto}/page.tsx`, `src/components/cabecera-consular.tsx`.
- **Criterio:** C-02 (dos dispositivos, dos nombres), C-03, C-04 (recinto ajeno por id → 404 y la consulta directa devuelve 0 filas por RLS).
- **Pruebas:** `tests/db/sesion-consular.test.ts`.

### T24 · Panel de jornada
- **Archivos:** `src/server/consular/recinto.ts` (estado del recinto: avance por hito desde `v_avance_recinto`, habilitación por JRV con `evaluarHito`, borradores no), ruta `GET /api/consular/recinto/[id]`, `p/consular/page.tsx`, `src/components/jornada/*.tsx`.
- **Criterio:** cuatro áreas de 02 §A.1; acción principal correcta en los escenarios de T22; a 375 px sin desplazamiento horizontal.
- **Pruebas:** `tests/db/recinto-consular.test.ts` (acción principal según estados).

### T25 · Actualizar hitos (individual, grupo, corrección)
- **Archivos:** `src/server/consular/hitos.ts`, ruta `POST /api/consular/hitos` `{client_id, recinto_id, hito, cambios:[{jrv_id, estado}]}`, `p/consular/avance/[hito]/page.tsx`, `p/consular/historial/page.tsx`.
- **Pasos:** por cada cambio: validar pertenencia y `evaluarHito` (salvo correcciones a pendiente/sin_informacion); upsert + historial (01 §5); respuesta `{guardadas, rechazadas:[{jrv_id, motivos}]}`; registrar `operaciones_recibidas`.
- **Criterio:** C-05 a C-11, C-16.
- **Pruebas:** `tests/db/hitos.test.ts` (grupo con excepciones; JRV no tocadas siguen sin información; mismo `client_id` dos veces = un efecto; dos sesiones sobre JRV distintas no se pisan; última recibida gana con historial).

### T26 · Votantes, «sin novedades» e incidencias (consulado)
- **Archivos:** `src/server/consular/{votantes,sin-novedades,incidencias}.ts`, rutas `POST /api/consular/{votantes,sin-novedades,incidencias,incidencias/[id]/accion}`, `p/consular/{votantes,incidencias,incidencias/nueva,incidencias/[id]}/page.tsx`.
- **Criterio:** C-13, C-14, C-17; resolución parcial deja abiertas las JRV restantes; reabrir conserva id; con catálogo vacío solo «Otro» y descripción obligatoria.
- **Pruebas:** `tests/db/incidencias-consular.test.ts`, `tests/db/votantes.test.ts`.

### T27 · Borradores locales y estado de conexión
- **Archivos:** `src/components/borradores.ts` (`enviarOperacion`, almacenamiento `cne-borradores:<consulado>`), `src/components/estado-conexion.tsx`, `p/consular/borradores/page.tsx`.
- **Criterio:** C-15: con la red cortada (DevTools «Offline») el cambio queda como borrador, no se ve en Quito; al volver, «Enviar» lo confirma; reenviar no duplica.
- **Pruebas:** `tests/borradores.test.ts` (unidad con `localStorage` simulado y `fetch` que falla/acierta).

### T28 · Repaso consular a 375 px y textos
- **Objetivo:** recorrido completo en móvil con datos de demo; textos en usted, frases cortas.
- **Criterio:** lista C-01…C-17 marcada en `docs/diseno/pruebas-manuales.md` (crear) con fecha y resultado.

## H4 · Tablero DGSMH (23–25-11)

### T29 · Consolidado y estado para Quito
- **Archivos:** `src/domain/avance.ts` (`sumarAvance`, `porcentaje(c,t)` con 0 si t = 0 y texto «sin JRV»), `src/domain/estado-marcador.ts` (peor estado de 02 §B.1), `src/server/dgsmh/estado.ts`, ruta `GET /api/dgsmh/estado` (consulados con lat/lon, estado, avance por hito sumado, urgentes sin acuse, indicadores, `generado_en`).
- **Criterio:** Q-06 (recintos 10/10 y 0/90 → consulado 10/100 = 10 %, no 50 %); Q-07.
- **Pruebas:** `tests/avance.test.ts`, `tests/db/estado-dgsmh.test.ts` (no devuelve ningún campo de Madrid).

### T30 · Mapa mundial con agrupación y zoom
- **Archivos:** `src/components/mapa/mapa-mundo.tsx` ("use client"; `d3-geo` `geoNaturalEarth1`, `topojson-client` + `world-atlas/countries-110m.json` importado estáticamente; `d3-zoom` para pan/zoom; agrupación en píxeles < 18 px recalculada al hacer zoom), `src/components/mapa/marcador.tsx`, `p/dgsmh/page.tsx`.
- **Criterio:** Q-02, Q-03; 100 marcadores fluidos en un portátil; marcadores con texto accesible (`<title>`); ubicaciones aproximadas con borde discontinuo; lista «Sin ubicación en el mapa».
- **Pruebas:** `tests/agrupacion.test.ts` (función pura de agrupación).

### T31 · Capa día/noche (terminador solar)
- **Archivos:** `src/domain/solar.ts` (`puntoSubsolar(fecha)`: declinación y ecuación del tiempo, aproximación NOAA; `antipoda`), `src/components/mapa/capa-solar.tsx` (`geoCircle().center(antípoda).radius(90)` noche; radios 84 y 78 crepúsculo), deslizador ±12 h y «Ahora».
- **Criterio:** Q-04: mover el deslizador cambia solo la capa; 21-12 a 12:00 UTC el punto subsolar ≈ (0°, −23,4°) ± 1°.
- **Pruebas:** `tests/solar.test.ts` (equinoccio y solsticios con tolerancia).

### T32 · Panel lateral: urgentes, indicadores, sonido
- **Archivos:** `src/components/dgsmh/panel-alertas.tsx`, `src/components/sonidos.ts` (`alertTone`), ruta `POST /api/dgsmh/apoyo/[id]/recibido`.
- **Criterio:** Q-09, Q-10 (urgente con audio bloqueado → aviso visual persistente), Q-11 (Recibido silencia esa urgencia en todos los tableros en el siguiente sondeo; la incidencia sigue abierta).
- **Pruebas:** `tests/db/apoyo.test.ts`.

### T33 · Alertas por actualización esperada ausente
- **Archivos:** `src/domain/alertas.ts` (`alertasAusencia(recintos, ahora, margen)`; hitos esperados: `inicio` a las 09:00 local, `cierre_votacion` a las 19:00 local — horas DECIDIDAS §4; solo modo elección y día 29), integración en `/api/dgsmh/estado`.
- **Criterio:** Q-08; margen vacío → ninguna alerta y texto «Alertas por ausencia desactivadas (margen pendiente)».
- **Pruebas:** `tests/alertas.test.ts`.

### T34 · Fichas de consulado y recinto
- **Archivos:** `p/dgsmh/{consulado/[id],recinto/[id]}/page.tsx`, `src/server/dgsmh/fichas.ts`.
- **Criterio:** Q-05 (hora local del recinto, no del navegador); cuadrícula JRV × hitos con texto de estado.
- **Pruebas:** `tests/db/fichas-dgsmh.test.ts`.

### T35 · Incidencias desde Quito
- **Archivos:** `src/server/dgsmh/incidencias.ts`, rutas `POST /api/dgsmh/incidencias/[id]/accion`, `p/dgsmh/incidencias/{page,[id]/page}.tsx` (reutiliza componentes de la ficha consular).
- **Criterio:** Q-12, Q-13; marcar seguimiento; cierre con explicación obligatoria; actor = usuario DGSMH.
- **Pruebas:** `tests/db/incidencias-dgsmh.test.ts`.

### T36 · Informes PDF y Excel
- **Archivos:** `src/server/pdf/tabla.ts` (tabla paginada con pdf-lib), `src/server/pdf/informe.ts`, `src/server/dgsmh/informe.ts` (datos con hora de corte), `src/server/excel/informe.ts`, rutas `GET /api/dgsmh/informes/{pdf,xlsx}?ambito=…`, `p/dgsmh/informes/page.tsx`.
- **Criterio:** Q-14, Q-15; el texto «No es acta electoral ni resultado oficial del CNE» está en el PDF; ninguna columna de Madrid.
- **Pruebas:** `tests/db/informe-dgsmh.test.ts` (hojas y totales del Excel; PDF con nº de páginas > 0).

## H5 · Madrid operación y finanzas (24–26-11)

### T37 · Centro de mando: estado de las 95 juntas
- **Archivos:** `src/domain/dotacion.ts` (`estadoJunta(presentes)`: 0 rojo «Nadie», 1–2 ámbar «Faltan n», ≥3 verde «3 presentes»; `transferibles`), `src/server/madrid/mando.ts`, ruta `GET /api/madrid/mando/estado`, `p/madrid/mando/page.tsx` y la vista de estación `mando`, `src/components/mando/*.tsx`.
- **Criterio:** M-08, M-09; filtros y orden de 02 §C.4; sondeo 3 s.
- **Pruebas:** `tests/dotacion.test.ts`, `tests/db/mando.test.ts`.

### T38 · Propuestas de movimiento y movimientos manuales
- **Archivos:** `src/domain/propuestas.ts`, `src/server/madrid/movimientos.ts`, rutas `GET /api/madrid/mando/propuesta`, `POST /api/madrid/mando/decision`, `POST /api/madrid/mando/excepcion`.
- **Algoritmo `siguientePropuesta(juntas, miembros, descartes)`** (determinista):
  1. Disponibles por junta = miembros con junta vigente = j, ingresados y sin excepción.
  2. Destinos = juntas con 1 ≤ disponibles < 3 ordenadas por faltantes (1 antes que 2), luego juntas con 0; desempate por `orden_cercania`, serie, número.
  3. Candidatos = disponibles con `rol = 'suplente'` en juntas con disponibles > 3 (su salida deja ≥ 3), excluyendo personas con decisión `no_viable` y pares (persona, destino) con decisión `pasada`.
  4. Para el primer destino con candidatos: misma zona primero; si no, menor `|orden_cercania_origen − orden_cercania_destino|`; desempate: junta de origen con más disponibles, luego apellidos.
  5. Devuelve `{mjrv, origen, destino, motivo, quedanEnOrigen, presentesDestinoTras}` o `null`.
  Al decidir: el servidor recalcula y, si la propuesta ya no es la misma válida, responde «La situación cambió». Manual: cualquier disponible a cualquier destino, con confirmación si el origen queda < 3.
- **Criterio:** M-10…M-13; nunca dos movimientos aceptados de la misma persona en el mismo instante (bloqueo `FOR UPDATE` sobre `mjrv`).
- **Pruebas:** `tests/propuestas.test.ts` (misma zona preferida; otra zona por cercanía; no deja origen < 3; excluye no viables; `null` si no hay), `tests/db/movimientos.test.ts` (aceptar actualiza `v_mjrv_asignacion`; pasar no cambia nada).

### T39 · Formulario de documentos (QR genérico y estación)
- **Archivos:** `p/madrid/d/[token]/page.tsx`, `p/madrid/e/[token]/trabajo/documentacion.tsx`, `src/components/captura-documento.tsx` (cámara, recuadro ID-1, captura manual, recorte con canvas, JPEG 0,85 ≤ 1.600 px), `src/server/madrid/documentos.ts` (`sharp` re-codifica y quita EXIF; cifrado; funciones SECURITY DEFINER de 01 §4 para `publico`), rutas `POST /api/madrid/documentos/{buscar,subir}`, `GET /api/madrid/documentos/[mjrvId]/[lado]` (solo admin y estaciones documentación/finanzas; `Cache-Control: no-store`), `p/madrid/documentos-qr/page.tsx` (cartel A4 con QR grande).
- **Criterio:** M-14, M-15 (mismo hash en ambos lados → rechazo); límites de consulta pública; la URL de imagen sin sesión → 401.
- **Pruebas:** `tests/db/documentos.test.ts` (cifrado ida y vuelta; rechazo de imagen < 20 KB; límite de intentos públicos).

### T40 · Captura automática
- **Archivos:** `src/components/captura-documento.tsx` (`useCapturaAutomatica`): cada 200 ms compara el recuadro reducido a 64 × 40 con el anterior (diferencia media < umbral = quieto) y mide nitidez (varianza del laplaciano > umbral); 5 lecturas seguidas buenas → captura. Umbrales en constantes con comentario «ajustar en ensayo real».
- **Criterio:** en un móvil real, con la cédula quieta en el recuadro, captura sola en ≤ 3 s; el botón manual sigue disponible (§13.7).
- **Pruebas:** `tests/captura.test.ts` (funciones puras de diferencia y laplaciano con matrices sintéticas).

### T41 · Parámetros de pago y cálculo del importe
- **Archivos:** `src/domain/pago.ts` (`calcularEur(p) → {ok:true, eur:'123.45'} | {ok:false, faltan:[...]}` con aritmética decimal en enteros —`BigInt` escalado—, sin `number` flotante), `p/madrid/finanzas/parametros.tsx`, `src/server/madrid/parametros.ts`.
- **Criterio:** F-09 (cualquier parámetro vacío → `ok:false` y lista de faltantes).
- **Pruebas:** `tests/pago.test.ts` (ambos sentidos, 0 y 2 decimales, mitad arriba y truncar, faltantes).

### T42 · Estación de finanzas y acta de pago
- **Archivos:** `p/madrid/e/[token]/trabajo/finanzas.tsx`, `src/server/madrid/finanzas.ts` (`fichaPago(cedula)`, `generarActa(mjrvId, verificado)`), `src/server/pdf/acta.ts` (02 §C.8, dos páginas, marcas «MODELO PROVISIONAL» y «PRUEBA»), rutas `POST /api/madrid/finanzas/ficha`, `POST /api/madrid/finanzas/acta` → PDF, `POST /api/madrid/finanzas/atencion`.
- **Criterio:** F-01, F-02, F-03, F-04; reimpresión numerada; sin documentos → no hay acta definitiva.
- **Pruebas:** `tests/db/acta.test.ts` (acta no crea pago; segunda impresión `impresion_n = 2`), `tests/acta-pdf.test.ts` (2 páginas; textos obligatorios presentes).

### T43 · Confirmación atómica del pago
- **Archivos:** `src/server/madrid/finanzas.ts` (`confirmarPago(mjrvId, actaId)`), ruta `POST /api/madrid/finanzas/confirmar`.
- **Criterio:** F-05, F-06, F-07.
- **Pruebas:** `tests/db/pago-concurrencia.test.ts`: 3 confirmaciones simultáneas (`Promise.all` con tres conexiones) → exactamente 1 fila y 2 respuestas «Ya pagado»; en modo elección un pago de prueba previo no bloquea.

### T44 · Panel financiero e informe de cierre Madrid
- **Archivos:** `src/server/madrid/finanzas-resumen.ts`, ruta `GET /api/madrid/finanzas/resumen`, `p/madrid/finanzas/page.tsx`, `src/server/pdf/informe-madrid.ts`, `src/server/excel/informe-madrid.ts`, `p/madrid/informes/page.tsx`.
- **Criterio:** F-08 (total EUR = suma de `pagos_confirmados`; actas impresas no cuentan).
- **Pruebas:** `tests/db/finanzas-resumen.test.ts`.

### T45 · Repaso Madrid en dispositivos reales
- **Objetivo:** probar puerta (móvil Android e iPhone), documentos con cámara, impresión A4 de credenciales y del acta en la impresora de finanzas, lectura del QR impreso.
- **Criterio:** filas M-01…M-15 y F-01…F-09 marcadas en `docs/diseno/pruebas-manuales.md`; ajustes de umbrales de T40 anotados.

## H6 · Integración y preparación (26–28-11)

### T46 · Matriz de permisos automática
- **Archivos:** `tests/db/permisos.test.ts`.
- **Pasos:** para cada combinación (host × tipo de sesión × endpoint de `/api/*`) comprobar 404/401/403 o 200 según 00 §4 y 02; incluye URL directa de foto, PDF de acta y credencial, exportaciones.
- **Criterio:** Q-01, C-04, S-05; ningún endpoint de Madrid responde a sesiones DGSMH/consulado/superadmin.

### T47 · Preparar elección
- **Archivos:** `src/server/admin/preparar-eleccion.ts`, `p/admin/preparar-eleccion/page.tsx`.
- **Pasos:** 00 §8 con `withOwner`; lista de tablas de actividad en una constante (orden de borrado: `pagos_confirmados`, `actas_pago`, `atenciones_finanzas`, `documentos_mjrv`, `decisiones_movimiento`, `excepciones_disponibilidad`, `lecturas_puerta`, `actuaciones_incidencia`, `solicitudes_apoyo`, `incidencia_jrv`, `incidencias`, `reportes_hito_historial`, `reportes_hito`, `votantes_historial`, `votantes`, `sin_novedades`, `operaciones_recibidas`); luego maestros de demo `es_prueba = true` en orden de dependencias: `envios_credencial` y `trabajos` de MJRV de prueba, `mjrv`, `sesiones_estacion` de enlaces/operadores de prueba, `enlaces_estacion` y `operadores_madrid` con `es_prueba`, `sesiones` y `codigos_recuperacion` de usuarios de prueba, `usuarios` con `es_prueba`, `tipos_incidencia`, `jrv`, `recintos`, `consulados`; `modo = 'eleccion'`.
- **Criterio:** S-03, S-04, S-06: tras ejecutar, recuentos de actividad = 0 en modo elección, maestros reales intactos, `respaldo_limpieza` con las filas; repetir no borra nada.
- **Pruebas:** `tests/db/preparar-eleccion.test.ts` (con datos mixtos reales y de prueba; fallo provocado a mitad → nada borrado).

### T48 · Copias, reversión y ensayo de restauración
- **Pasos:** `BACKUP_INTERVAL_SECONDS=3600` del 28 al 30 (variable en `.env.production`, cambiada por el flujo de despliegue con entrada `copias_horarias: si/no`); ensayar en la VM restaurar la última copia en una base `cne_restaurada` y contar filas; probar `revertir` en el flujo de despliegue.
- **Criterio:** procedimiento de `06` §5–§6 ejecutado una vez con éxito y anotado.

### T49 · Ensayo general en producción (modo prueba)
- **Objetivo:** recorrido completo con varias personas: 2 consulados de demo en móviles, Quito en escritorio, Madrid con puerta, mando, documentos y 2 puestos de finanzas.
- **Criterio:** todas las filas de §17 marcadas; incidencias encontradas corregidas o anotadas como riesgo aceptado por Pablo.

### T50 · Carga de datos reales (cuando lleguen)
- **Objetivo:** primera carga de catálogo, cuentas y MJRV reales (§3: la hace el agente, no Pablo).
- **Pasos:** revisar el archivo; ajustar el **mapeo de columnas** del importador (solo ese objeto); ejecutar en local con informe; compartir el informe de inconsistencias con Pablo; aplicar en producción con `scripts/importar-*.ts` dentro de `cne-app` (`docker compose exec`); generar credenciales reales.
- **Criterio:** informe sin errores; recuentos anunciados a Pablo; nada inventado para rellenar huecos.

### T51 · Preparar la elección (noche del 28-11)
- **Pasos:** confirmar con Pablo; copia manual (`06` §5); ejecutar «Preparar elección»; comprobar S-04 en los cuatro portales; activar copias horarias.
- **Criterio:** banda «MODO PRUEBA» desaparece; tableros sin actividad; credenciales y cuentas funcionan.
