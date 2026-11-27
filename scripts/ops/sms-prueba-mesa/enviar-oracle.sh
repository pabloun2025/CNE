set -euo pipefail
umask 077
directorio=$1
operacion=/tmp/cne-sms-prueba-mesa-20261127
openssl cms -decrypt -binary -inform DER -inkey "$operacion/privada.pem" -in "$directorio/prueba.cms" -out "$directorio/prueba.json"
mkdir "$operacion/solicitado"
tar -C "$directorio" -cf - prueba.mjs prueba.json sms.key |
  sudo docker exec -i cne-prod-cne-app-1 sh -c '
    set -eu
    umask 077
    t=$(mktemp -d)
    trap '\''rm -rf -- "$t"'\'' EXIT
    cd "$t"
    tar -xf -
    node prueba.mjs
  '
