# 00 · Arquitectura — Proyecto CNE (jornada del 29-11-2026)

**Estado:** diseño técnico para construir, 17-11-2026. Autorizado por Pablo para construir y desplegar.
**Fuente canónica:** `ESPECIFICACION_FUNCIONAL.md` (citada como «§n»). Lo marcado **ABIERTO** en la especificación no se decide aquí: se diseña para funcionar sin esa decisión y se lista en `05-preguntas-abiertas.md` (citado como «P-n»).

## 1. Resumen de decisiones

| Tema | Decisión | Por qué |
| --- | --- | --- |
| Aplicación | **Una** app Next.js 16 (App Router) + un trabajador Node, mismo repositorio e imagen Docker | §1: una sola app con portales independientes. Una imagen, un despliegue, un catálogo. |
| Separación de portales | Por **host**: `proxy.ts` reescribe cada host a su carpeta interna; cada página, ruta API y acción vuelve a comprobar host + tipo de sesión; cookies por host; RLS en PostgreSQL | §2, §10.4: aislamiento por servidor, no por menús. Tres barreras independientes. |
| Base de datos | PostgreSQL 16 **en contenedor propio pequeño** dentro del proyecto Compose `cne-prod` (por defecto; P-2) | Aislamiento de datos y copias, no tocar contenedores ajenos (AGENTS.md), precedente de teinvito. Coste ≈ 100 MB de RAM. |
| Roles de base | `cne_owner` (esquema, migraciones, limpieza de pruebas) y `cne_app` (web y trabajador, sin DDL) | Lo mínimo para que la web no pueda alterar el esquema ni saltarse RLS. |
| Autorización en base | RLS con dos variables de transacción (`cne.portal`, `cne.consulado_id`) y filtro automático por modo prueba | Segunda barrera contra errores de código (C-04, Q-01). ~40 líneas de SQL. |
| Tiempo real | **Sondeo** (polling) JSON: Quito 10 s, centro de mando 3 s, finanzas 5 s | Lo más simple que cumple §12.1. Sin SSE ni WebSockets a través del túnel. |
| Sin conexión | Borradores en `localStorage` del portal consular con identificador único por operación; envío manual; sin PWA ni sincronización automática | §5, §11.7. |
| Modo prueba | Columna `es_prueba` en tablas de actividad, con valor por defecto calculado en la base y filtrado por RLS; limpieza = respaldo en tabla + `DELETE … WHERE es_prueba` en una transacción | §8, §14.2–14.3. Ver §8 de este documento. |
| Husos horarios | Todo en `timestamptz` (UTC); cada recinto tiene zona IANA; la hora local se calcula **en el servidor** con `Intl` | §11.4, §16.3, C-10. |
| PDF | `pdf-lib` + `qrcode` (credenciales, actas, informes) | Reutiliza `teinvito/src/server/invitation-ticket.ts`; `embedPage` permite girar la credencial en A4. |
| Excel | `xlsx` (SheetJS) para leer importaciones y escribir informes | Ya usado en consulares. |
| Mapa | SVG con `d3-geo` + `d3-zoom` + `topojson-client` + `world-atlas` (110m); terminador solar calculado en código | Sin teselas externas ni claves; funciona con red pobre; la capa solar es un círculo geográfico. |
| Lector QR | `BarcodeDetector` nativo y, si falta, `jsqr` (copiado de `teinvito/src/components/door-scanner.tsx`) | Probado en puerta de teinvito con iPhone y Android. |
| WhatsApp | Evolution API **existente** (contenedor `evolution-api` del proyecto consulares), instancia a decidir (P-3); envío real apagado por defecto | §4, §13.3. No se duplica el servicio. |
| Correo | Brevo API (igual que consulares/teinvito); envío real apagado por defecto | §13.3. |
| Propuestas de movimiento | **Algoritmo determinista** (misma zona → zona más cercana); IA local opcional y fuera del plan base (P-11) | Explicable, comprobable con pruebas, sin dependencia del contenedor Ollama de teinvito (que está en otra red). |

## 2. Pila y dependencias

Copiar versiones de los repositorios de referencia (ya probadas juntas): `next 16.4.6`, `react`/`react-dom 19.3.0`, `pg ^8.23.1`, `pdf-lib ^1.17.1`, `qrcode ^1.5.4`, `jsqr ^1.4.0`, `@node-rs/argon2 ^2.2.2`, `xlsx ^0.18.5`, `zod ^4.6.7`, `sharp ^0.35.5`, `tsx ^4.23.15`, `server-only`. Desarrollo: `typescript ^5`, `tailwindcss ^4` + `@tailwindcss/postcss`, `eslint ^9` + `eslint-config-next 16.4.6`, `vitest ^3.2.7`, tipos (`@types/pg`, `@types/qrcode`, `@types/node ^22`).
Nuevas (versión estable al instalar, fijada por `package-lock.json`): `d3-geo`, `d3-zoom`, `d3-selection`, `topojson-client`, `world-atlas` y sus `@types`.

**Next.js 16 tiene cambios incompatibles.** Tras `npm install`, el programador lee `node_modules/next/dist/docs/` antes de escribir código. Lo que ya se ve en consulares/teinvito: el antiguo `middleware.ts` se llama `src/proxy.ts` y exporta `proxy()`; `params` y `searchParams` son `Promise`; `cookies()` y `headers()` son asíncronos.

Puerto interno: **38473** (consulares usa 38471 y teinvito 38472). Ningún puerto se publica en el anfitrión.

## 3. Despliegue en la VM compartida

```
VM Oracle (ubuntu@51.170.51.109)
├── proyecto citas-prod (consulares)     ← NO SE TOCA
│   ├── cloudflared  (túnel gestionado en Cloudflare, por token)
│   ├── evolution-api (+ su postgres y redis, perfil whatsapp)
│   └── red citas-prod_interna
├── proyecto teinvito-prod               ← NO SE TOCA (ya usa citas-prod_interna para túnel y Evolution)
└── proyecto cne-prod  en /home/ubuntu/cne
    ├── cne-postgres   (solo red cne_interna)
    ├── cne-migrate    (se ejecuta y termina)
    ├── cne-app        (cne_interna + citas-prod_interna, alias cne-app)
    ├── cne-worker     (cne_interna + citas-prod_interna)
    └── cne-backup     (solo cne_interna; vuelca a /home/ubuntu/cne/backups)
```

- **Túnel:** no se crea otro. Se añaden los hostnames de CNE al túnel que ya sirve `recordatorio.consulado.app`, con servicio `http://cne-app:38473` (script copiado de `teinvito/scripts/cloudflare-dominio.py`; ver `06-despliegue-y-secretos.md`).
- **Nombres de servicio con prefijo `cne-`.** En la red compartida `citas-prod_interna` ya existen los nombres `app` y `postgres` de consulares. Compose añade el nombre del servicio como alias en cada red: un servicio CNE llamado `app` o `postgres` en esa red haría que `http://app:38471` o `postgres:5432` resolvieran a dos contenedores. Por eso **todos** los servicios CNE se llaman `cne-*` y la base solo está en `cne_interna`. (Conviene que Pablo compruebe si teinvito, cuyos servicios se llaman `app`, ya provoca esa ambigüedad: fuera del alcance de CNE.)
- **Capacidad:** no comprobada. Estimación CNE: app ≈ 300 MB, trabajador ≈ 150 MB, postgres ≈ 100 MB, disco < 2 GB (imagen + base con fotos cifradas + copias). Se confirma con `oracle-inspect.yml` (tarea T03) antes del primer despliegue. Si la memoria libre es < 1 GB, se pasa a P-2 opción B (base dentro del PostgreSQL de consulares).

## 4. Separación por portal

| Portal | Host propuesto (P-1) | Carpeta interna | Prefijo API | Sesión (cookie host-only) |
| --- | --- | --- | --- | --- |
| Reporte consular | `cne.consulares.app` | `src/app/p/consular/` | `/api/consular/` | `cne_sesion` de usuario tipo `consulado` |
| Tablero DGSMH | `control.consulares.app` | `src/app/p/dgsmh/` | `/api/dgsmh/` | `cne_sesion` de usuario tipo `dgsmh` |
| Madrid (admin, estaciones, QR genérico) | `madrid.consulares.app` | `src/app/p/madrid/` | `/api/madrid/` | `cne_sesion` (admin) o `cne_estacion` (operador con PIN) |
| Superadministración | `admin.consulares.app` | `src/app/p/admin/` | `/api/admin/` | `cne_sesion` de usuario `superadmin` con 2FA verificada |

Los hosts se leen de variables (`HOST_CONSULAR`, `HOST_DGSMH`, `HOST_MADRID`, `HOST_ADMIN`). En local: `cne.localhost`, `control.localhost`, `madrid.localhost`, `admin.localhost` (los navegadores resuelven `*.localhost` a 127.0.0.1).

**Tres barreras:**
1. `src/proxy.ts`: calcula el portal por host; reescribe `/<ruta>` a `/p/<portal>/<ruta>`; devuelve 404 si alguien pide directamente `/p/...` o una `/api/<otro-portal>/...`; host desconocido → 404. Añade `x-cne-portal` a la petición y las cabeceras de seguridad de consulares (`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`).
2. `src/server/guard.ts`: cada layout, página, ruta API y acción llama a `requirePortal(portal, tipos)`, que vuelve a calcular el portal desde la cabecera `host` (no se fía de `x-cne-portal`), lee la cookie, valida la sesión (tipo de usuario coherente con el portal) y abre la transacción con las variables de RLS. Sin sesión válida: redirección al acceso del mismo host (páginas) o 401 (API).
3. RLS en PostgreSQL (ver `01-modelo-datos.md` §RLS): aunque el código olvide un filtro, un consulado no ve recintos ajenos y Quito no ve tablas de Madrid.

Cookies **sin atributo `Domain`** (solo valen en el host que las creó): una sesión de Madrid no viaja a `control.*`. `httpOnly`, `sameSite=lax`, `secure` en producción, 16 h de vida (jornada completa, §2).

**Por qué una sola app y no cuatro:** comparten catálogo (recintos/JRV), modo prueba y despliegue; cuatro apps cuadruplicarían despliegues y copias con 12 días de plazo. El aislamiento exigido (§2) se cumple en servidor con las tres barreras y se verifica con pruebas automáticas de la matriz de permisos (T45).

## 5. Autenticación por tipo de usuario

| Tipo | Cómo entra | Reglas |
| --- | --- | --- |
| Consulado (§2, §11.1) | Correo + contraseña de la cuenta institucional compartida. Primer acceso: cambio obligatorio. Después: nombre del operador (una vez por sesión) y recinto activo | Mínimo 8 caracteres, sin más reglas de composición (§2). Varias sesiones simultáneas. El nombre y el recinto se guardan en la fila de sesión; «Cambiar operador» y «Cambiar recinto» los actualizan sin cerrar sesión. |
| DGSMH (§2) | Correo + contraseña individual | Primer acceso con contraseña temporal → cambio. Sin 2FA. |
| Admin Madrid (§2) | Correo + contraseña de la cuenta administrativa de Madrid | Una o pocas cuentas tipo `madrid_admin`; distinta de la cuenta consular de Madrid. |
| Operadores de estación Madrid (§2, §13.10) | Abren el **enlace de estación** (`/e/<token>`, token aleatorio de 32 bytes, solo se guarda su hash), eligen su nombre en la lista de operadores habilitados para esa función y teclean su **PIN de 4 dígitos** | PIN con hash argon2. 5 fallos por operador → bloqueo 15 min; 20 fallos por enlace en 15 min → bloqueo del enlace 15 min. El admin revoca enlaces y operadores. Cookie `cne_estacion` ligada a enlace + operador; el servidor comprueba en cada petición que ambos siguen activos y que la función del enlace permite la acción. «Cambiar operador» borra la cookie. |
| Superadmin (§14) | Correo + contraseña + **TOTP** (2FA reciclada de consulares: `src/domain/totp.ts`, `src/server/mfa.ts`) y códigos de recuperación | La cuenta inicial se crea en `cne-migrate` desde `SUPERADMIN_EMAIL` + `SUPERADMIN_PASSWORD_INICIAL` con cambio obligatorio y alta de 2FA en el primer acceso. Sin 2FA verificada en la sesión no se abre nada del portal. |

Contraseñas: argon2id con los parámetros de `consulares/src/server/passwords.ts`. Límite de intentos: tabla `intentos_acceso` (30 por IP en 15 min; 10 por correo en 15 min), mensaje genérico. No hay recuperación por correo en la primera versión: la superadmin restablece contraseñas temporales (consulares, DGSMH, Madrid) y el admin Madrid restablece PIN (§2 ABIERTO: política de cambio/recuperación de PIN; se ofrece lo mínimo, «restablecer PIN» por el admin Madrid).

## 6. Sin conexión (portal consular)

- Cada operación consular (marcar JRV, votantes, sin novedades, incidencia, resolución) se construye en el cliente como un objeto con `client_id` (UUID), recinto, fase, datos y hora original del dispositivo.
- Se envía por `fetch` a `/api/consular/...`. Si la red falla o tarda > 15 s, se guarda en `localStorage` bajo `cne-borradores:<consulado_id>` y se muestra «Guardado en este dispositivo, pendiente de envío».
- La pantalla «Borradores» lista los pendientes (recinto, fase, cambios, hora original) con «Enviar» y «Descartar». Nunca se envían solos (§5).
- El servidor guarda cada `client_id` aceptado en `operaciones_recibidas`; un reenvío devuelve el resultado anterior sin repetir el efecto (C-16).
- Si la pestaña ya estaba abierta, la interfaz sigue funcionando sin red. Recargar sin red no está garantizado (no hay PWA, §11.7). Se prueba en navegadores reales (T47).
- Borradores ligados al consulado: al cerrar sesión se avisa si quedan borradores.

## 7. Tiempo real

Sondeo JSON con `fetch` + `setInterval` (patrón de `teinvito/src/components/live-board.tsx`):

| Pantalla | Intervalo | Endpoint |
| --- | --- | --- |
| Tablero DGSMH (mapa + panel) | 10 s | `GET /api/dgsmh/estado` |
| Centro de mando Madrid | 3 s | `GET /api/madrid/mando/estado` |
| Panel financiero | 5 s | `GET /api/madrid/finanzas/resumen` |
| Inicio admin Madrid | 10 s | `GET /api/madrid/resumen` |
| Panel consular | tras cada envío + 30 s | `GET /api/consular/recinto/<id>` |

Las respuestas incluyen `generado_en` (hora del servidor). Si una petición falla, la pantalla muestra «Sin actualizar desde hh:mm» y sigue intentándolo. Volumen esperado: decenas de pantallas abiertas; consultas agregadas sobre < 2.000 JRV: trivial para PostgreSQL. El sonido de urgencia (Q-10) se genera en el cliente cuando el sondeo trae una solicitud urgente sin acuse.

## 8. Modo prueba y preparación de la elección (§8, §14.2–14.3)

**Técnica elegida: columna `es_prueba` en las tablas de actividad**, con:
- `DEFAULT cne.en_prueba()` (función que lee `configuracion.modo`): el código no puede olvidarse de etiquetar.
- Política RLS `es_prueba = cne.en_prueba()` en lectura y escritura: en modo elección los registros de prueba no se ven ni cuentan **aunque no se hayan borrado**; en modo prueba los reales no se mezclan con los simulados.
- Las tablas maestras (consulados, recintos, JRV, MJRV, cuentas, operadores, parámetros) **no** dependen del modo: los importadores escriben siempre `es_prueba = false`. Solo el script de demostración crea maestros con `es_prueba = true` (nombres «PRUEBA», cédulas 0000000001…).
- `envios_credencial` es preparación, no actividad: no se borra; lleva `simulado` cuando el proveedor era el simulado.

**«Borrar datos de prueba y preparar para elección»** (solo superadmin, con 2FA, conexión `cne_owner`):
1. Muestra recuento por categoría de lo que se borrará y lista de lo que se conserva.
2. Exige escribir `PREPARAR ELECCIÓN`.
3. En **una transacción**: copia cada fila a borrar a `respaldo_limpieza(lote, tabla, fila jsonb)`, comprueba que el número copiado coincide con el número a borrar, borra en orden de dependencias, borra maestros de demostración (`es_prueba = true`), pone `configuracion.modo = 'eleccion'`. Cualquier fallo → `ROLLBACK`, nada borrado (§14.3 paso 3).
4. Muestra el resultado (recuentos antes/después, lote de respaldo) y lo registra en `auditoria`.
5. Repetirlo no hace nada: no quedan filas con `es_prueba = true` y nunca toca filas `false` (S-06).

Además, el trabajo de despliegue hace un `pg_dump` previo y la copia diaria pasa a horaria los días 28–30 (ver `06`).

## 9. Husos horarios y reloj

- Persistencia en `timestamptz`; hora de recepción del servidor (`recibido_en = now()`) decide «último reporte vigente» (§5, §16.3). La hora del dispositivo solo se guarda como dato informativo (`hora_dispositivo`).
- Cada recinto tiene `zona_horaria` IANA (p. ej. `Europe/Madrid`), cargada del catálogo con su fuente. Sin zona válida: el recinto queda «pendiente de zona horaria»; en modo elección no puede registrar escrutinio (mensaje claro) y aparece en la verificación de la superadmin (§14.4).
- Fecha de jornada fija en código: `2026-11-29` (producto de una sola jornada, §1). Regla de escrutinio (§11.4): `ahora_local(recinto) >= 2026-11-29 19:00` **y** cierre de votación completado para esa JRV. Se calcula en el servidor (C-10); la interfaz solo refleja la respuesta del servidor.
- Quito muestra hora de referencia de Quito (`America/Guayaquil`) y UTC en cabecera; cada consulado/recinto, su hora local.
- Capa solar: posición del sol calculada con la hora UTC real (o la del deslizador de simulación visual, Q-04), nunca usada para estados.

## 10. Trabajador

`src/worker.ts`, misma imagen, usuario `cne_app` con `cne.portal = 'worker'`. Bucle cada 2 s: toma un trabajo de `trabajos` con `FOR UPDATE SKIP LOCKED` (patrón de consulares). Tipos:
- `enviar_credencial_whatsapp`: genera el PDF individual y lo envía por `sendMedia` de Evolution; pausa aleatoria 20–45 s entre envíos (ritmo «normal» de consulares para evitar bloqueo del número); solo de 08:00 a 21:00 hora de Madrid.
- `enviar_credencial_correo`: Brevo con el PDF adjunto; pausa 2 s.
Sin envío real (`WHATSAPP_REAL_SEND`/`EMAIL_REAL_SEND` ≠ `true`) usa el proveedor simulado y marca `simulado = true`.

## 11. Estructura del repositorio

```
src/
  proxy.ts                      host → portal
  app/
    api/salud/route.ts          comprobación de vida (sin sesión, en todos los hosts)
    p/consular/…  p/dgsmh/…  p/madrid/…  p/admin/…
    api/consular/…  api/dgsmh/…  api/madrid/…  api/admin/…
  domain/                       lógica pura, sin base (probada con vitest)
    portal.ts fases.ts hora-local.ts avance.ts propuestas.ts pago.ts cedula.ts
    credencial-layout.ts importacion/*.ts solar.ts totp.ts
  server/                       acceso a datos (server-only)
    db.ts guard.ts auth.ts estacion.ts crypto.ts passwords.ts auditoria.ts
    consular/*.ts dgsmh/*.ts madrid/*.ts admin/*.ts
    pdf/credencial.ts pdf/acta.ts pdf/informe.ts pdf/tabla.ts
    envios/evolution.ts envios/brevo.ts
  components/                   comunes ("use client" solo en los interactivos)
  worker.ts
db/ schema.sql  migrations/AAAA-MM-DD-nombre.sql  seed/juntas-madrid.sql
scripts/ prepare-db.ts  demo-data.ts  importar-*.ts
public/marca/cne-elecciones-2027.jpg   (extraído del PDF modelo, ver 03)
docker/ postgres-init.sh  backup.sh
docker-compose.oracle.yml  Dockerfile  scripts/deploy-oracle.sh
.github/workflows/ ci.yml  oracle-deploy.yml  oracle-inspect.yml (existe)  dominio.yml
tests/  (vitest: unidades de domain/ y pruebas contra base cne_test)
```

## 12. Interfaz

Español, trato de usted, frases cortas. Tailwind 4 sin librería de componentes (menos dependencias). Colores de estado siempre con texto e icono (§10.5). Ancho mínimo de diseño 375 px. Banda superior fija roja «MODO PRUEBA — los datos son simulados» en los cuatro portales cuando `modo = 'prueba'` (S-01). Sin gradientes ni animaciones decorativas; el único elemento que parpadea es la solicitud urgente sin acuse (borde, no la pantalla entera).
