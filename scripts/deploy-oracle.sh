#!/usr/bin/env bash
# Despliegue de CNE en la VM compartida. Uso: deploy-oracle.sh [desplegar|revertir]
# Solo toca el proyecto Compose cne-prod: nunca consulares ni teinvito. Sin set -x ni eco de variables.
set -euo pipefail

ACCION="${1:-desplegar}"
APP_DIR=/home/ubuntu/cne
BOOTSTRAP_FILE=/tmp/cne-bootstrap.json
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
  dc up -d --no-build cne-app
  esperar_salud
  comprobar_desde_red_compartida
  dc ps
  exit 0
fi

test -f "$BOOTSTRAP_FILE"
install -d -m 700 "$APP_DIR/backups" "$APP_DIR/backups/pre-despliegue"
chmod 700 "$APP_DIR/backups"

python3 - "$BOOTSTRAP_FILE" "$ENV_FILE" "${CONSULARES_DIR:-/home/ubuntu/consulares}" "${TEINVITO_DIR:-/home/ubuntu/teinvito}" <<'PY'
import json
import secrets
import base64
import sys
from pathlib import Path

bootstrap_path, output_path = map(Path, sys.argv[1:3])
# Carpeta de consulares (solo lectura): de ahí se copian las claves de envío. Nunca se escribe en ella.
consulares_dir = Path(sys.argv[3]) if len(sys.argv) > 3 else Path("/home/ubuntu/consulares")
# Carpeta de teinvito (solo lectura): de ahí se copian las variables de Google Wallet del emisor institucional.
teinvito_dir = Path(sys.argv[4]) if len(sys.argv) > 4 else Path("/home/ubuntu/teinvito")

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
existing = dotenv(output_path)

if not bootstrap.get("APP_VERSION"):
    raise SystemExit("Falta APP_VERSION en el paquete de despliegue.")

# La clave maestra puede no llegar de GitHub: la primera vez se genera aquí (equivale a «openssl rand -base64 32»)
# y se conserva siempre. Con otra clave, las fotos y los secretos TOTP guardados quedarían ilegibles: se detiene.
llegada = bootstrap.get("APP_MASTER_KEY") or ""
if llegada and existing.get("APP_MASTER_KEY") and existing["APP_MASTER_KEY"] != llegada:
    raise SystemExit("APP_MASTER_KEY del paquete difiere de la del servidor. Despliegue detenido; no se ha cambiado nada.")
clave = existing.get("APP_MASTER_KEY") or llegada or base64.b64encode(secrets.token_bytes(32)).decode()

# La superadmin define su contraseña en el primer acceso: ya no hay contraseña inicial (si quedó una en el archivo, se descarta).
# El correo antiguo por defecto (superadmin@cne.local) se sustituye por el de Pablo.
def elegir(key: str, defecto: str = "") -> str:
    return bootstrap.get(key) or existing.get(key) or defecto

correo_superadmin = elegir("SUPERADMIN_EMAIL")
if not correo_superadmin or correo_superadmin == "superadmin@cne.local":
    correo_superadmin = "pabloun@gmail.com"

values = {
    "POSTGRES_PASSWORD": existing.get("POSTGRES_PASSWORD") or secrets.token_hex(32),
    "CNE_APP_PASSWORD": existing.get("CNE_APP_PASSWORD") or secrets.token_hex(32),
    "APP_MASTER_KEY": clave,
    "SUPERADMIN_EMAIL": correo_superadmin,
    "APP_VERSION": bootstrap["APP_VERSION"],
    # El host puede estar aún sin decidir (Q-R1): la aplicación no depende de él.
    "HOST_MADRID": elegir("HOST_MADRID"),
    "SMSPUBLI_API": elegir("SMSPUBLI_API"),
    "COOKIE_SECURE": "1",
    "BACKUP_KEEP_DAYS": "14",
    "BACKUP_INTERVAL_SECONDS": existing.get("BACKUP_INTERVAL_SECONDS") or "86400",
}

# Claves de WhatsApp (Evolution API compartida) y correo (Brevo) de consulares. Se copian sin imprimirlas; si no se pueden
# leer, quedan las que ya hubiera o vacías y la aplicación sigue en modo simulado. La línea de CNE es una instancia propia.
def legible(path: Path) -> dict[str, str]:
    try:
        return dotenv(path)
    except OSError:
        return {}

fuente = legible(consulares_dir / ".env.production")
evolucion = legible(consulares_dir / "docker" / "evolution.env")

def copiada(key: str, valor: str) -> str:
    valor = (valor or "").strip()
    if any(char in valor for char in "\r\n'"):
        valor = ""
    return valor or existing.get(key, "")

values["EVOLUTION_API_URL"] = "http://evolution-api:8080"
values["EVOLUTION_API_KEY"] = copiada("EVOLUTION_API_KEY", fuente.get("EVOLUTION_API_KEY") or evolucion.get("AUTHENTICATION_API_KEY") or "")
values["BREVO_API_KEY"] = copiada("BREVO_API_KEY", fuente.get("BREVO_API_KEY", ""))
values["MAIL_FROM_ADDRESS"] = copiada("MAIL_FROM_ADDRESS", fuente.get("MAIL_FROM_ADDRESS", ""))

# Google Wallet (credencial para Android): tres variables de teinvito, sin imprimirlas. Sin ellas la función queda oculta.
wallet = legible(teinvito_dir / ".env.production")
for clave_wallet in ("GOOGLE_WALLET_ISSUER_ID", "GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL", "GOOGLE_WALLET_PRIVATE_KEY"):
    values[clave_wallet] = copiada(clave_wallet, wallet.get(clave_wallet, ""))
wallet_listo = all(values[k] for k in ("GOOGLE_WALLET_ISSUER_ID", "GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL", "GOOGLE_WALLET_PRIVATE_KEY"))

output_path.write_text("\n".join(f"{key}={quoted(value)}" for key, value in values.items()) + "\n")
output_path.chmod(0o600)
print(f"Claves de envío: WhatsApp {'sí' if values['EVOLUTION_API_KEY'] else 'no'}, correo {'sí' if values['BREVO_API_KEY'] and values['MAIL_FROM_ADDRESS'] else 'no'}")
print(f"Google Wallet: {'sí' if wallet_listo else 'no'}")
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
dc up -d cne-app
# El contenedor de copias lee docker/backup.sh desde un montaje: se recrea para usar la versión nueva.
dc up -d --force-recreate --no-deps cne-backup

esperar_salud
comprobar_desde_red_compartida
# Libera disco sin tocar volúmenes ni imágenes en uso; nunca se borran contenedores huérfanos (podrían ser ajenos).
docker image prune -f || true
docker builder prune -f --filter until=72h || true
dc ps
