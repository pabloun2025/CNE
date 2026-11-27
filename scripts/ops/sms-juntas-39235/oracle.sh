set -euo pipefail
umask 077
carpeta=$1
modo=$2
operacion=/tmp/cne-sms-juntas-39235-20261127
app=cne-prod-cne-app-1
diario=/run/cne-padron-movil/cne-sms-juntas-39235-20261127/diario.ndjson
resultado=0
if [ "$modo" = enviar ] || [ "$modo" = verificar ]; then
  exec 9>"$operacion/envio.lock"
  flock -n 9
  openssl cms -decrypt -binary -inform DER -inkey "$operacion/privada.pem" -in "$carpeta/lote.cms" -out "$carpeta/lote.json.gz"
  salida=/dev/stdout
  if [ "$modo" = verificar ]; then salida="$carpeta/previa.json"; fi
  tar -C "$carpeta" -cf - envio.mjs lote.json.gz sms.key |
    sudo docker exec -i "$app" sh -c '
      set -eu
      umask 077
      t=$(mktemp -d)
      trap '\''rm -rf -- "$t"'\'' EXIT
      cd "$t"
      tar -xf -
      node envio.mjs "$1"
    ' sh "$modo" > "$salida" || resultado=$?
  if [ "$modo" = verificar ]; then
    if [ "$resultado" = 0 ]; then
      openssl cms -encrypt -binary -aes256 -in "$salida" -outform DER -out "$carpeta/previa.cms" "$carpeta/respuesta.crt"
      printf 'PREVIA_CNE=%s\n' "$(base64 -w0 "$carpeta/previa.cms")"
    fi
    exit "$resultado"
  fi
fi
if sudo docker exec "$app" test -s "$diario"; then
  sudo docker exec "$app" cat "$diario" | gzip -c > "$carpeta/diario.gz"
  openssl cms -encrypt -binary -aes256 -in "$carpeta/diario.gz" -outform DER -out "$carpeta/diario.cms" "$carpeta/respuesta.crt"
  base64 -w 1900 "$carpeta/diario.cms" | awk '{printf "DIARIO_CNE_%05d=%s\n",NR,$0}'
else
  echo "Todavía no hay diario de envío."
fi
exit "$resultado"
