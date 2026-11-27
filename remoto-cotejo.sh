set -euo pipefail
umask 077
trabajo=$1
modo=$2
clave_dir=/tmp/cne-revision-f44-ops
case "$modo" in
  clave)
    if [ ! -d "$clave_dir" ]; then
      mkdir -m 700 "$clave_dir"
      openssl req -x509 -newkey rsa:3072 -keyout "$clave_dir/clave.pem" -out "$clave_dir/publico.pem" -days 1 -nodes -subj /CN=CNE-cotejo-produccion >/dev/null 2>&1
    fi
    cat "$clave_dir/publico.pem"
    exit ;;
  limpiar)
    unlink "$clave_dir/clave.pem"
    unlink "$clave_dir/publico.pem"
    rmdir "$clave_dir"
    exit ;;
  ejecutar)
    openssl cms -decrypt -binary -inform DER -in "$trabajo/madrid.cms" -inkey "$clave_dir/clave.pem" -out "$trabajo/madrid.json"
    ;;
  *) exit 1 ;;
esac
tar -C "$trabajo" -cf - aplicar-cotejo.ts madrid.json |
  sudo docker exec -i -e CNE_COTEJO_MODO="$modo" cne-prod-cne-app-1 sh -c '
    set -eu
    umask 077
    t=$(mktemp -d)
    trap '"'"'unlink "$t/aplicar-cotejo.ts"; unlink "$t/madrid.json"; rmdir "$t"'"'"' EXIT
    tar -xf - -C "$t"
    CNE_COTEJO_ARCHIVO="$t/madrid.json" ./node_modules/.bin/tsx -e "$(cat "$t/aplicar-cotejo.ts")"
  '
