# 06 · Despliegue, secretos, DNS, copias y reversión

Producción: VM Oracle compartida `ubuntu@51.170.51.109`, carpeta `/home/ubuntu/cne`, proyecto Compose `cne-prod`, archivo `docker-compose.oracle.yml`. **Nunca** se reinicia, detiene ni modifica un contenedor de `citas-prod` (consulares) o `teinvito-prod`. CNE solo **se une** a la red `citas-prod_interna` (para el túnel y Evolution), como ya hace teinvito.

## 1. Secretos

### 1.1 Secretos de GitHub en `pabloun2025/CNE` (Settings → Secrets and variables → Actions)

| Nombre | Obligatorio | Para qué | De dónde se obtiene |
| --- | --- | --- | --- |
| `ORACLE_SSH_KEY` | Sí | SSH a la VM en `oracle-inspect.yml` y `oracle-deploy.yml` | La misma clave privada que ya usan consulares/teinvito (secreto `ORACLE_SSH_KEY` de `teinvito`). Pablo la copia de su gestor; GitHub no permite leer un secreto de otro repositorio. |
| `APP_MASTER_KEY` | Sí | Cifra fotos de cédula, secretos TOTP y tokens de enlaces (AES-256-GCM) | Pablo la genera una vez en su equipo: `openssl rand -base64 32`; la guarda **también** en su gestor de contraseñas. No se cambia nunca después del primer despliegue. |
| `SUPERADMIN_EMAIL` | No | Correo de la superadmin | Por defecto `pabloun@gmail.com`. |
| `SUPERADMIN_PASSWORD_INICIAL` | No (obsoleta) | Ya no se usa: la superadmin define su contraseña en el primer acceso | Se ignora si existe. |
| `CLOUDFLARE_API_TOKEN` | Sí para `dominio.yml` | Añadir hostnames al túnel existente y crear su DNS | Cloudflare → My Profile → API Tokens: permisos *Account · Cloudflare Tunnel · Edit* y *Zone · DNS · Edit* sobre la zona de P-1. Puede ser el mismo token que tiene teinvito si ya incluye esa zona. Alternativa sin token: Pablo añade los hostnames a mano en Zero Trust (§3). |
| `BREVO_API_KEY` | No | Correo de credenciales | Si falta, el script copia `BREVO_API_KEY` de `/home/ubuntu/consulares/.env.production` (sin mostrarla), como hace teinvito. |
| `MAIL_FROM`, `MAIL_FROM_NAME` | No | Remitente (P-4) | Remitente ya validado en Brevo (p. ej. el de consulares). Sin ellos, el correo queda simulado. |
| `EVOLUTION_INSTANCE` | No | Instancia de WhatsApp (P-3) | Nombre de la instancia (`cne` o `invitaciones`). Sin él, WhatsApp queda simulado. |

**Variables (no secretas) de GitHub** (*Variables* del repositorio): `HOST_CONSULAR`, `HOST_DGSMH`, `HOST_MADRID`, `HOST_ADMIN` (P-1).

### 1.2 `.env.production` en el servidor (lo genera `scripts/deploy-oracle.sh`, permisos 600)

| Variable | Origen |
| --- | --- |
| `POSTGRES_PASSWORD` (cne_owner), `CNE_APP_PASSWORD` | Generadas en el primer despliegue (`secrets.token_hex(32)`) y conservadas siempre. |
| `APP_MASTER_KEY` | Del secreto; si ya existe en el servidor y es distinta, el despliegue **se detiene**. |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD_INICIAL` | Del secreto; solo se usan si no existe ningún superadmin. |
| `EVOLUTION_API_KEY` | Copiada de `/home/ubuntu/consulares/.env.production` en cada despliegue. |
| `EVOLUTION_INSTANCE`, `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME` | Secretos o copia (ver arriba). |
| `WHATSAPP_REAL_SEND`, `EMAIL_REAL_SEND` | Se **conserva** el valor del servidor; por defecto `false`. Se cambian a mano (`sed` en el servidor + `docker compose up -d cne-worker`) solo con orden expresa de Pablo. |
| `HOST_CONSULAR`, `HOST_DGSMH`, `HOST_MADRID`, `HOST_ADMIN`, `APP_VERSION` | Del flujo. |
| `BACKUP_KEEP_DAYS=14`, `BACKUP_INTERVAL_SECONDS` | 86400; 3600 del 28 al 30-11 (T48). |

Ningún paso imprime valores: `set +x`, sin `echo` de variables, el JSON temporal se borra siempre (`if: always()`), y la inspección solo lista **nombres** de variables.

## 2. Requisitos previos (una vez)

1. Pablo carga los secretos de §1.1 (al menos `ORACLE_SSH_KEY`, `APP_MASTER_KEY`, `SUPERADMIN_*`).
2. Ejecutar **`oracle-inspect.yml`** (solo lectura). Apuntar aquí: memoria libre, disco libre, contenedores, redes, que existe `citas-prod_interna` y `evolution-api`, y si `consulares.app` aparece en la configuración del túnel.
   *Resultado de la inspección:* **pendiente** (rellenar).
3. Decidir P-1 (hosts) y P-2 (base: por defecto contenedor propio).
4. Criterio para seguir: memoria libre ≥ 1,5 GB y disco libre ≥ 5 GB. Si no, avisar a Pablo antes de desplegar.

## 3. DNS y túnel

No se crea túnel nuevo: se añaden reglas al túnel gestionado en Cloudflare que ya sirve `recordatorio.consulado.app`.

- **Con token:** `dominio.yml` → `accion=comprobar`, `hosts=<los cuatro hosts>` (muestra cuenta, zona y túneles) → `accion=crear`. El script inserta cada hostname **antes** de la regla final `http_status:404`, con servicio `http://cne-app:38473`, y crea el CNAME `<host> → <id-túnel>.cfargotunnel.com` (proxied).
- **A mano (alternativa):** Cloudflare Zero Trust → Networks → Tunnels → túnel de consulares → Public Hostname → *Add* por cada host: tipo HTTP, URL `cne-app:38473`.
- **Recomendado:** Cloudflare Access (código por correo) delante de `HOST_ADMIN`, igual que consulares protege su `/superadmin`. Capa adicional a la 2FA.
- **Riesgo conocido** (AGENTS de consulares): algunas operadoras españolas bloquean IP compartidas de Cloudflare en días de partido. Comprobar el 29 desde la red de la Caja Mágica y tener datos móviles de otra operadora como respaldo.

## 4. Despliegue (cada versión)

Desde GitHub → Actions → **Deploy to Oracle** → `accion=desplegar` (rama `main`; publicar en `main` según AGENTS: con visto bueno de Pablo, ya dado para la construcción).

El flujo: CI (tsc, lint, vitest con PostgreSQL de servicio, build) → empaqueta el código (sin `.git`, `node_modules`, `backups`) → `scp` → `scripts/deploy-oracle.sh`:
1. Prepara `/home/ubuntu/cne` (conserva `.env.production` y `backups/`).
2. Genera/actualiza `.env.production` (§1.2).
3. Si `cne-postgres` está en marcha: `pg_dump -Fc` a `backups/pre-despliegue/cne-<fecha>-<sha>.dump` (conserva 5).
4. `docker tag cne:local cne:anterior` (si existe) → `docker compose build`.
5. `up -d cne-postgres` → `run --rm cne-migrate` (migraciones aditivas, seeds idempotentes, superadmin inicial).
6. `up -d cne-app cne-worker cne-backup` → espera a que `cne-app` esté *healthy* (`/api/salud`).
7. Comprueba desde la red compartida: `docker compose exec -T cne-app node -e "fetch('http://cne-app:38473/api/salud')…"`.
8. `docker image prune -f`; `docker builder prune -f --filter until=72h` (no toca volúmenes ni imágenes en uso de otros proyectos).

Comprobación manual tras desplegar: `https://<HOST_CONSULAR>/api/salud` devuelve la versión (sha) esperada; `docker ps` muestra consulares y teinvito con el mismo «Up …» que antes.

**Congelación:** después de «Preparar elección» (noche del 28) solo se despliegan correcciones críticas, con copia manual previa.

## 5. Copias de seguridad

| Copia | Cuándo | Dónde | Conservación |
| --- | --- | --- | --- |
| Diaria (`cne-backup`, `pg_dump -Fc`) | Cada 24 h | `/home/ubuntu/cne/backups/` (700; archivos 600) | 14 días |
| Horaria (mismo servicio, `BACKUP_INTERVAL_SECONDS=3600`) | Cada hora del 28 al 30-11 | `backups/horarias/` | 24 últimas |
| Previa a despliegue | Cada despliegue | `backups/pre-despliegue/` | 5 últimas |
| Previa a limpieza de pruebas | Dentro de la transacción | Tabla `respaldo_limpieza` | Hasta después de la elección |
| Manual | Antes de «Preparar elección» y antes de cualquier corrección del 29 | `docker compose -p cne-prod exec -T cne-postgres pg_dump -U cne_owner -Fc cne > backups/manual-$(date -u +%Y%m%dT%H%MZ).dump` | — |

Las copias contienen cédulas y fotos **cifradas**; las fotos solo se pueden leer con `APP_MASTER_KEY`. Copia externa (R2) no configurada: tras la jornada, Pablo decide si descarga una copia cifrada (pendiente institucional de conservación, §16.2).

**Restaurar (ensayo T48 y emergencia):**
```bash
cd /home/ubuntu/cne
DC="docker compose -p cne-prod -f docker-compose.oracle.yml --env-file .env.production"
$DC exec -T cne-postgres createdb -U cne_owner cne_restaurada
$DC exec -T cne-postgres pg_restore -U cne_owner -d cne_restaurada --no-owner < backups/<archivo>.dump
$DC exec -T cne-postgres psql -U cne_owner -d cne_restaurada -c 'SELECT count(*) FROM cne.recintos; SELECT count(*) FROM cne.mjrv;'
# Sustituir producción (solo emergencia): parar app/worker, renombrar bases, arrancar.
$DC stop cne-app cne-worker
$DC exec -T cne-postgres psql -U cne_owner -d postgres -c "ALTER DATABASE cne RENAME TO cne_rota; ALTER DATABASE cne_restaurada RENAME TO cne;"
$DC exec -T cne-postgres psql -U cne_owner -d cne -c "GRANT CONNECT ON DATABASE cne TO cne_app;"
$DC run --rm cne-migrate   # vuelve a aplicar permisos (GRANT) y funciones
$DC up -d cne-app cne-worker
```

## 6. Reversión

- **Código:** Actions → Deploy to Oracle → `accion=revertir` → `docker tag cne:anterior cne:local` y `up -d --no-build cne-app cne-worker`. Válido porque hasta el 30-11 las migraciones son **solo aditivas** (columnas/tablas nuevas que el código anterior ignora).
- **Datos:** restaurar la copia previa al despliegue (§5) solo si una migración dañó datos.
- **Modo:** volver a modo prueba no borra nada (los datos reales quedan ocultos, no eliminados); se vuelve con el mismo interruptor.
- **Desinstalar CNE** (si Pablo lo pidiera): `docker compose -p cne-prod down` (sin `-v` para conservar datos) y quitar los hostnames del túnel. No afecta a consulares ni teinvito.

## 7. Recursos previstos

| Servicio | Límite de memoria | Notas |
| --- | --- | --- |
| `cne-app` | 768 MB | Next.js; genera PDF en memoria |
| `cne-worker` | 384 MB | Envíos; un trabajo a la vez |
| `cne-postgres` | 512 MB | `shared_buffers` por defecto; base estimada < 1 GB con fotos |
| `cne-backup` | 128 MB | — |

Logs: json-file 10 MB × 3 por servicio. Disco: imagen ≈ 600 MB; base < 1 GB (las fotos cifradas, ≈ 300 MB para 600 personas, no se comprimen en el volcado); 24 copias horarias + 14 diarias ≈ 12 GB en el peor caso. Si la inspección muestra < 20 GB libres, conservar 12 horarias.
