set -euo pipefail
umask 077
trabajo=$1
modo=$2
estado=/home/ubuntu/cne/.sms-madrid-29n-primer-envio
mkdir -p -m 700 "$estado"

case "$modo" in
  comprobar)
    if [[ ! -f "$estado/cert.pem" ]]; then
      openssl req -x509 -newkey rsa:3072 -keyout "$estado/clave.pem" -out "$estado/cert.pem" -days 1 -nodes -subj /CN=CNE-SMS-MADRID-29N >/dev/null 2>&1
    fi
    cat "$estado/cert.pem"
    touch "$trabajo/lista.txt"
    ;;
  reconciliar) touch "$trabajo/lista.txt" ;;
  enviar|continuar)
    if ! grep -Eq '"final":true,"primerPendiente":1000,"total":29786' "$estado/resultado.log"; then
      echo 'El lote principal todavía no está conciliado.'
      exit 1
    fi
    openssl cms -decrypt -binary -inform DER -in "$trabajo/lista.cms" -inkey "$estado/clave.pem" -out "$trabajo/lista.txt"
    test -s "$trabajo/lista.txt"
    marca=envio-complemento-iniciado
    if [[ "$modo" == continuar ]]; then test -f "$estado/envio-iniciado"; marca=continuar-iniciado; fi
    if ! (set -o noclobber; date -u +%FT%TZ > "$estado/$marca"); then
      echo 'El lote ya fue iniciado. Consulte el registro antes de repetir.'
      exit 1
    fi
    ;;
  consultar)
    if [[ -f "$estado/resultado-complemento.log" ]]; then cat "$estado/resultado-complemento.log"; fi
    exit
    ;;
  limpiar)
    if [[ -f "$estado/clave.pem" ]]; then unlink "$estado/clave.pem"; fi
    if [[ -f "$estado/cert.pem" ]]; then unlink "$estado/cert.pem"; fi
    exit
    ;;
  *) exit 2 ;;
esac
tar -C "$trabajo" -cf - sms-madrid-29n.mjs sms.key lista.txt |
  sudo docker exec -i -e CNE_SMS_MODO="$modo" cne-prod-cne-app-1 sh -c '
    set -eu
    umask 077
    t=$(mktemp -d)
    trap '"'"'rm -rf -- "$t"'"'"' EXIT
    cd "$t"
    tar -xf -
    API_SMSQUEENS=$(cat sms.key) node sms-madrid-29n.mjs
  ' | if [[ "$modo" == enviar || "$modo" == continuar ]]; then tee -a "$estado/resultado-complemento.log"; else cat; fi
