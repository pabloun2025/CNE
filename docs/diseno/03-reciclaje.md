# 03 · Reciclaje desde consulares, teinvito y DEMP

Los repositorios de referencia son **solo lectura**: se copia el archivo a CNE y se adapta. Ruta origen relativa a `/home/user/<repo>/`. «Tal cual» = copiar y cambiar solo nombres de variables/textos.

## Infraestructura y despliegue

| Origen | Destino en CNE | Adaptación |
| --- | --- | --- |
| `teinvito/.github/workflows/oracle-deploy.yml` | `.github/workflows/oracle-deploy.yml` | Sin `oracle-bootstrap.json.enc`: los valores vienen de secretos de GitHub (lista en `06`) en un JSON temporal; rutas `/home/ubuntu/cne`; excluir `backups/`; entrada `accion: desplegar | revertir`. |
| `teinvito/scripts/deploy-oracle.sh` | `scripts/deploy-oracle.sh` | Proyecto `cne-prod`, archivo `docker-compose.oracle.yml`; genera/conserva `.env.production` (contraseñas de base se crean una vez y se conservan; `APP_MASTER_KEY` llega del secreto de GitHub y el script **se detiene** si cambia respecto a la del servidor, para no dejar ilegibles las fotos); copia `EVOLUTION_API_KEY` y, si falta el secreto, `BREVO_API_KEY` desde `/home/ubuntu/consulares/.env.production` (igual que teinvito); `pg_dump` previo si la base existe; `docker tag cne:local cne:anterior` antes de construir; comprobación de salud con `docker compose exec cne-app`; **quitar** la parte de Ollama y de SQLite; **no** usar `--remove-orphans`. |
| `teinvito/docker-compose.oracle.yml` | `docker-compose.oracle.yml` | Servicios renombrados `cne-*`; red externa `citas-prod_interna` solo para `cne-app` y `cne-worker` (alias `cne-app`); `cne-postgres` solo en `cne_interna`; sin Ollama; `logging` json-file 10 MB × 3 (de teinvito); `mem_limit` 768m app, 384m worker, 512m postgres. |
| `consulares/Dockerfile` | `Dockerfile` | Puerto 38473; usuario `cne`; sin caché de modelo IA; copiar `public/`, `db/`, `scripts/`, `src/`. |
| `consulares/docker/postgres-init-prod.sh` | `docker/postgres-init.sh` | Un solo rol `cne_app`. |
| `consulares/docker/backup.sh` | `docker/backup.sh` | Prefijo `cne-`; intervalo `BACKUP_INTERVAL_SECONDS` (por defecto 86400). Con 3600 (28–30-11) escribe en `backups/horarias/` y conserva las 24 últimas (`ls -t | tail -n +25 | xargs rm`); las diarias siguen 14 días. |
| `teinvito/scripts/cloudflare-dominio.py` + `teinvito/.github/workflows/dominio.yml` | `scripts/cloudflare-dominio.py`, `.github/workflows/dominio.yml` | Zona `consulares.app` (P-1); origen = hostname que ya sirve el túnel (`recordatorio.consulado.app`); servicio de la regla nueva **forzado** a `http://cne-app:38473` (en teinvito copia el servicio del origen: aquí sería el de consulares, incorrecto). Admite varios hosts. |
| `teinvito/.github/workflows/ci.yml` | `.github/workflows/ci.yml` | Postgres de servicio `cne_test`; pasos `npm ci`, `tsc`, `lint`, `vitest`, `build`; sin el control de cupo de minutos (innecesario 12 días). |
| `teinvito/src/app/api/salud/route.ts` | `src/app/api/salud/route.ts` | Tal cual (consulta `SELECT 1` con `cne_app`). Excluido del reescrito por host en `proxy.ts`. |
| `CNE/.github/workflows/oracle-inspect.yml` (ya existe) | — | Se ejecuta tal cual antes del primer despliegue. |

## Base de datos y servidor

| Origen | Destino | Adaptación |
| --- | --- | --- |
| `consulares/src/server/db.ts` | `src/server/db.ts` | Dos pools (`cne_app`, `cne_owner`); `search_path=cne,public`; sustituir `withSession`/`withDashboard` por `withPortal(scope, fn)` que hace `set_config('cne.portal'…)`, `set_config('cne.consulado_id'…)`; conservar `inOrder`. |
| `consulares/src/server/schema-apply.ts` + `scripts/prepare-db.ts` | `src/server/schema-apply.ts`, `scripts/prepare-db.ts` | Esquema `cne`; sin `functions.sql` separado (funciones dentro de `schema.sql` y migraciones); además: seed de `juntas_madrid` y `zonas_referencia_2026` (idempotente), superadmin inicial desde variables. |
| `consulares/src/server/env.ts` | `src/server/env.ts` | Tal cual. |
| `consulares/src/server/crypto.ts` | `src/server/crypto.ts` | Tal cual (`APP_MASTER_KEY` AES-256-GCM, `randomToken`). Se usa para TOTP, fotos de cédula y tokens de enlaces mostrables. |
| `consulares/src/server/passwords.ts` | `src/server/passwords.ts` | Tal cual (argon2id). También para PIN. |
| `consulares/src/domain/password-policy.ts` | `src/domain/password-policy.ts` | **Reducir** a «mínimo 8 caracteres» (+ lista corta de bloqueadas); quitar exigencia de mayúscula/número/signo (§2, §16.1). |
| `consulares/src/domain/text.ts` (`sha256Hex`) | `src/domain/text.ts` | Solo las funciones usadas. |
| `consulares/src/server/auth.ts` | `src/server/auth.ts` | Login por portal con tipo de usuario; sin registro público ni recuperación por correo; sesiones en tabla `sesiones` con `portal`; límites con `intentos_acceso`. |
| `consulares/src/server/guard.ts` | `src/server/guard.ts` | `requirePortal(portal, tipos)` que comprueba host + cookie + tipo y abre `withPortal`; variante `requireEstacion(funciones)`; `cookieOptions()` 16 h sin `Domain`. |
| `consulares/src/domain/totp.ts` + `consulares/src/server/mfa.ts` | `src/domain/totp.ts`, `src/server/mfa.ts` | TOTP tal cual (emisor «CNE 2026»); `mfa.ts` con consultas directas a `usuarios`/`codigos_recuperacion` en lugar de funciones `mfa_*` SQL. |
| `consulares/src/proxy.ts` + `teinvito/src/proxy.ts` | `src/proxy.ts` | Cabeceras de seguridad de consulares + reescritura por host de teinvito, generalizada a los cuatro portales (ver 00 §4). |
| `consulares/src/server/auth.ts` (`insertAudit`) | `src/server/auditoria.ts` | Tabla `auditoria`. |
| `consulares/src/domain/phone.ts` | `src/domain/phone.ts` | Interpretación de teléfonos para WhatsApp (región por defecto ES). Requiere `libphonenumber-js`. |
| `consulares/vitest.config.ts`, `consulares/eslint.config.mjs`, `consulares/tsconfig.json` | raíz | Tal cual. |

## Madrid: puerta, envíos, PDF

| Origen | Destino | Adaptación |
| --- | --- | --- |
| `teinvito/src/components/door-scanner.tsx` | `src/components/lector-qr.tsx` | Conservar: cámara trasera, `BarcodeDetector` + `jsQR`, antirrebote, desbloqueo de audio, entrada manual, identificador de dispositivo. **Quitar**: modo salida, búsqueda por nombre, aforo, voz, VIP, cola offline (puerta CNE exige servidor; §13.4 trata la falta de red como error de operación). Prop `onCodigo(texto)` para reutilizarlo en puerta y finanzas. |
| `teinvito/src/components/door-feedback.ts` | `src/components/sonidos.ts` | Conservar `unlockAudio`, `feedback('valido'|'rechazo')` (880 Hz / 300+220 Hz) y `alertTone` (urgencias de Quito). Quitar `vipAnnounce`. |
| `teinvito/src/server/whatsapp.ts` (`evolutionMediaRequest`, `sendWhatsAppText`) + `teinvito/src/server/evolution.ts` (`whatsappReal`, tiempo límite, resultado `uncertain`) | `src/server/envios/evolution.ts` | Un solo envío `enviarDocumentoWhatsApp(telefono, texto, pdf)`; simulado si `WHATSAPP_REAL_SEND !== 'true'`; instancia `EVOLUTION_INSTANCE` (P-3); sin webhooks ni consentimientos (no hay conversación). «Sin identificador» = `fallo` con nota «incierto», nunca «entregada». |
| `teinvito/src/server/brevo.ts` (`brevoRequest`, `sendBrevoProvider`) | `src/server/envios/brevo.ts` | Adjunto PDF en base64; simulado si `EMAIL_REAL_SEND !== 'true'`; sin `replyTo` dinámico. |
| `teinvito/src/server/invitation-ticket.ts` | `src/server/pdf/credencial.ts` | Base de `pdf-lib` + `qrcode` + `latin()` para WinAnsi. Diseño nuevo según 02 §C.9; hoja A4 con `embedPage` + giro 90°. |
| `teinvito/src/server/jobs.ts` (`claimJob`/`completeJob`/`retryJob` con `FOR UPDATE SKIP LOCKED`) | `src/server/trabajos.ts`, `src/worker.ts` | Solo dos tipos de trabajo; pausa aleatoria 20–45 s entre WhatsApp (ritmo «normal» de comunicados de consulares). |
| `teinvito/src/components/live-board.tsx` (sondeo con `setInterval`) | patrón en `src/components/sondeo.ts` | Hook `useSondeo(url, ms)` con «Sin actualizar desde…». |
| `consulares/src/components/print-button.tsx` | `src/components/boton-imprimir.tsx` | Tal cual si sirve; el acta se abre como PDF en pestaña nueva. |

## Qué NO se recicla (y por qué)

| Elemento | Motivo |
| --- | --- |
| Ollama / `teinvito/src/server/local-ai.ts` | El contenedor está en la red interna de teinvito (no en `citas-prod_interna`) y consume hasta 10 GB; la propuesta determinista cumple §7.3. Opcional si Pablo lo pide (P-11). |
| RLS completo de consulares con funciones `SECURITY DEFINER` por sesión (`app_bind_session`) | Demasiado para 12 días; se sustituye por variables de transacción + políticas simples. |
| Webhooks de Evolution/Brevo | El estado «entregada» solo se mostraría si el proveedor lo confirma; sin webhooks queda «enviada al servicio», honesto según §13.3. |
| Cola sin conexión de la puerta de teinvito (`door-offline.ts`) | §7.5/§13.4: el estado central es obligatorio en puerta y finanzas. |
| DEMP (Vite + Supabase) | Pila distinta. Ideas tomadas: minimizar campos y pantallas, privacidad por diseño (no conservar más de lo necesario de documentos). No se copia código. |
| Plantillas de correo/WhatsApp de consulares | Un único texto fijo de envío de credencial basta. |

## Recurso gráfico: logotipo de la credencial

El PDF modelo contiene el logotipo como imagen JPEG incrustada (objeto 13, 386 × 174 px, ≈ 160 ppp; se repite en las dos credenciales). Extracción sin pérdida:

```bash
mkdir -p /tmp/cne-logo && pdfimages -j -f 1 -l 1 insumos/originales/MODELO_DE_CREDENCIALES_DE_MJRV.pdf /tmp/cne-logo/img
# img-000.jpg = logotipo CNE + «ELECCIONES SECCIONALES Y CPCCS 2027» + «Tu voto, tu decisión»
cp /tmp/cne-logo/img-000.jpg public/marca/cne-elecciones-2027.jpg
```

A 46 mm de ancho da ≈ 213 ppp: suficiente para impresión de oficina. El resto del modelo (banda, rótulo, pictograma, recuadros) es otra imagen rasterizada con los textos de ejemplo («M01», «PRESIDENTE»…), por eso se **recrea en vectores** y no se reutiliza. Si Pablo aporta el logotipo en vectorial o PNG de mayor resolución, se sustituye el archivo sin tocar código. El uso de la identidad gráfica del CNE en la credencial está en el modelo aportado por Pablo; en el **acta** no se usa ningún logotipo (no aportado).
