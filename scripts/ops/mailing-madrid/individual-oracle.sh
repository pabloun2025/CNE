set -euo pipefail
umask 077
directory=$1
openssl cms -decrypt -binary -inform DER -inkey /tmp/cne-madrid-campana-20261126/privada.pem -in "$directory/individual.cms" -out "$directory/individual.txt"
tar -C "$directory" -cf - enviar-prueba.mjs mailing-madrid.html mailing-madrid.json individual.txt |
  sudo docker exec -i cne-prod-cne-app-1 sh -c '
    set -eu
    umask 077
    temp=$(mktemp -d)
    trap '\''rm -rf -- "$temp"'\'' EXIT
    cd "$temp"
    tar -xf -
    node enviar-prueba.mjs
  '
