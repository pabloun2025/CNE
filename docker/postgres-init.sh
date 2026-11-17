#!/bin/sh
# Primer arranque de cne-postgres: crea el rol de la aplicación (cne_app, sin DDL).
# cne_owner ya existe: es POSTGRES_USER. Los permisos por tabla los da el esquema (T05).
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$CNE_APP_PASSWORD" <<'SQL'
CREATE ROLE cne_app LOGIN PASSWORD :'app_password';
GRANT CONNECT ON DATABASE cne TO cne_app;
SQL
