#!/usr/bin/env bash
# Despliegue de CNE en la VM compartida. Uso: deploy-oracle.sh [desplegar|revertir]
# Solo toca el proyecto Compose cne-prod: nunca consulares ni teinvito. Sin set -x ni eco de variables.
set -euo pipefail

ACCION="${1:-desplegar}"
APP_DIR=/home/ubuntu/cne
BOOTSTRAP_FILE=/tmp/cne-bootstrap.json
CONSULARES_ENV=/home/ubuntu/consulares/.env.production
ENV_FILE="$APP_DIR/.env.production"
COMPOSE_FILE="$APP_DIR/docker-compose.oracle.yml"
dc() { docker compose -p cne-prod --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
trap 'rm -f "$BOOTSTRAP_FILE"' EXIT

esperar_salud() {
  for _ in $(seq 1 24); do
    id=$(dc ps -q cne-app 2>/dev/null || true)
    estado=""
    if [ -n "$id" ]; then
      estado=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)
    fi
    [ "$estado" = healthy ] && return 0
    if [ "$estado" = unhealthy ] || [ "$estado" = exited ]; then
      dc logs --tail=100 cne-app
      return 1
    fi
    sleep 5
  done
  echo "cne-app no llegó a estar sano a tiempo." >&2
  return 1
}

comprobar_desde_red_compartida() {
  # Misma ruta que seguirá el túnel de Cloudflare: por el alias cne-app.
  dc exec -T cne-app node -e "fetch('http://cne-app:38473/api/salud').then(async r=>{if(!r.ok)throw new Error(String(r.status));console.log(await r.text())})"
}

case "$ACCION" in
  desplegar|revertir) ;;
  *) echo "Acción desconocida: use desplegar o revertir." >&2; exit 2 ;;
esac

if [ "$ACCION" = revertir ]; then
  cd "$APP_DIR"
  docker image inspect cne:anterior >/dev/null 2>&1 || { echo "No hay imagen cne:anterior para revertir." >&2; exit 1; }
  docker tag cne:anterior cne:local
  dc up -d --no-build cne-app cne-worker
  esperar_salud
  comprobar_desde_red_compartida
  dc ps
  exit 0
fi

test -f "$BOOTSTRAP_FILE"
install -d -m 700 "$APP_DIR/backups" "$APP_DIR/backups/pre-despliegue"
chmod 700 "$APP_DIR/backups"

python3 - "$BOOTSTRAP_FILE" "$CONSULARES_ENV" "$ENV_FILE" <<'PY'
import json
import secrets
import sys
from pathlib import Path

bootstrap_path, consulares_path, output_path = map(Path, sys.argv[1:])

def dotenv(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    if not path.exists():
        return result
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        result[key.strip()] = value
    return result

def quoted(value: str) -> str:
    if any(char in value for char in "\r\n'"):
        raise SystemExit("Una variable de despliegue contiene caracteres no admitidos.")
    return f"'{value}'"

bootstrap = json.loads(bootstrap_path.read_text())
consulares = dotenv(consulares_path)
existing = dotenv(output_path)

for key in ["APP_MASTER_KEY", "SUPERADMIN_EMAIL", "SUPERADMIN_PASSWORD_INICIAL", "APP_VERSION",
            "HOST_CONSULAR", "HOST_DGSMH", "HOST_MADRID", "HOST_ADMIN"]:
    if not bootstrap.get(key):
        raise SystemExit(f"Falta {key} en el paquete de despliegue.")

# Con otra clave maestra las fotos y los secretos TOTP ya guardados quedarían ilegibles: se detiene.
if existing.get("APP_MASTER_KEY") and existing["APP_MASTER_KEY"] != bootstrap["APP_MASTER_KEY"]:
    raise SystemExit("APP_MASTER_KEY del paquete difiere de la del servidor. Despliegue detenido; no se ha cambiado nada.")

if not consulares.get("EVOLUTION_API_KEY"):
    print("AVISO: no hay EVOLUTION_API_KEY en consulares; WhatsApp queda simulado.", file=sys.stderr)

def elegir(key: str) -> str:
    return bootstrap.get(key) or existing.get(key) or ""

values = {
    "POSTGRES_PASSWORD": existing.get("POSTGRES_PASSWORD") or secrets.token_hex(32),
    "CNE_APP_PASSWORD": existing.get("CNE_APP_PASSWORD") or secrets.token_hex(32),
    "APP_MASTER_KEY": bootstrap["APP_MASTER_KEY"],
    "SUPERADMIN_EMAIL": bootstrap["SUPERADMIN_EMAIL"],
    "SUPERADMIN_PASSWORD_INICIAL": bootstrap["SUPERADMIN_PASSWORD_INICIAL"],
    "APP_VERSION": bootstrap["APP_VERSION"],
    "HOST_CONSULAR": bootstrap["HOST_CONSULAR"],
    "HOST_DGSMH": bootstrap["HOST_DGSMH"],
    "HOST_MADRID": bootstrap["HOST_MADRID"],
    "HOST_ADMIN": bootstrap["HOST_ADMIN"],
    "COOKIE_SECURE": "1",
    "EVOLUTION_API_KEY": consulares.get("EVOLUTION_API_KEY", ""),
    "EVOLUTION_INSTANCE": elegir("EVOLUTION_INSTANCE"),
    "BREVO_API_KEY": bootstrap.get("BREVO_API_KEY") or consulares.get("BREVO_API_KEY") or existing.get("BREVO_API_KEY") or "",
    "MAIL_FROM": elegir("MAIL_FROM"),
    "MAIL_FROM_NAME": elegir("MAIL_FROM_NAME"),
    # Se conserva lo que haya en el servidor: se activan a mano y solo con orden de Pablo.
    "WHATSAPP_REAL_SEND": existing.get("WHATSAPP_REAL_SEND") or "false",
    "EMAIL_REAL_SEND": existing.get("EMAIL_REAL_SEND") or "false",
    "BACKUP_KEEP_DAYS": "14",
    "BACKUP_INTERVAL_SECONDS": existing.get("BACKUP_INTERVAL_SECONDS") or "86400",
}

output_path.write_text("\n".join(f"{key}={quoted(value)}" for key, value in values.items()) + "\n")
output_path.chmod(0o600)
PY

rm -f "$BOOTSTRAP_FILE"
cd "$APP_DIR"
dc config --quiet

# Copia previa si la base ya existe (se conservan las 5 últimas).
if [ -n "$(dc ps -q --status running cne-postgres 2>/dev/null || true)" ]; then
  version=$(sed -n "s/^APP_VERSION='\(.*\)'$/\1/p" "$ENV_FILE" | cut -c1-7)
  destino="backups/pre-despliegue/cne-$(date -u +%Y%m%dT%H%M%SZ)-${version:-sin-version}.dump"
  (umask 077; dc exec -T cne-postgres pg_dump -U cne_owner -Fc cne > "$destino") || { rm -f "$destino"; echo "Falló la copia previa; despliegue detenido." >&2; exit 1; }
  ls -t backups/pre-despliegue/cne-*.dump | tail -n +6 | xargs -r rm -f
fi

# Imagen anterior para poder revertir.
if docker image inspect cne:local >/dev/null 2>&1; then
  docker tag cne:local cne:anterior
fi

dc build cne-app
dc up -d cne-postgres
dc run --rm cne-migrate
dc up -d cne-app cne-worker
# El contenedor de copias lee docker/backup.sh desde un montaje: se recrea para usar la versión nueva.
dc up -d --force-recreate --no-deps cne-backup

esperar_salud
comprobar_desde_red_compartida
# Libera disco sin tocar volúmenes ni imágenes en uso; nunca se borran contenedores huérfanos (podrían ser ajenos).
docker image prune -f || true
docker builder prune -f --filter until=72h || true
dc ps
