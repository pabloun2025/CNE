#!/bin/sh
# Copias de la base de CNE en /backups (montado desde el anfitrión).
# Diaria: cada 24 h, se conserva BACKUP_KEEP_DAYS días.
# Con BACKUP_INTERVAL_SECONDS < 86400 (3600 del 28 al 30-11) además se escribe en horarias/ y se conservan las 24 últimas.
# Las copias llevan datos personales: nunca salen del servidor sin cifrar.
set -eu
umask 077
INTERVALO="${BACKUP_INTERVAL_SECONDS:-86400}"
mkdir -p /backups/horarias
while true; do
  sello=$(date -u +%Y%m%dT%H%M%SZ)
  # Diaria: solo si no hay ninguna de las últimas 24 h (en modo horario no se duplica).
  if [ -z "$(find /backups -maxdepth 1 -name 'cne-*.dump' -mtime -1 | head -n 1)" ]; then
    pg_dump --format=custom --no-owner --file "/backups/cne-$sello.dump" "$BACKUP_DATABASE_URL"
    echo "copia diaria cne-$sello.dump lista"
  fi
  if [ "$INTERVALO" -lt 86400 ]; then
    pg_dump --format=custom --no-owner --file "/backups/horarias/cne-$sello.dump" "$BACKUP_DATABASE_URL"
    ls -t /backups/horarias/cne-*.dump | tail -n +25 | xargs -r rm -f
    echo "copia horaria cne-$sello.dump lista"
  fi
  find /backups -maxdepth 1 -name 'cne-*.dump' -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
  sleep "$INTERVALO"
done
