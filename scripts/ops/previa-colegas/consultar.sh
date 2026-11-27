set -euo pipefail
umask 077
t=$1
clave=/tmp/cne-vista-previa-campos-20261127/privada.pem
openssl cms -decrypt -binary -inform DER -inkey "$clave" -in "$t/consulta.cms" -out "$t/consulta.json"
sudo docker exec -i cne-prod-cne-app-1 node --import tsx -e '
  const { readFileSync } = require("node:fs");
  const { join } = require("node:path");
  const { descifrar } = require("./src/server/puesto-movil/formato.ts");
  const normalizar = s => s.normalize("NFKD").replace(/\p{M}/gu, "").toUpperCase().match(/[A-Z]+/g)?.sort().join(" ");
  try {
    const peticiones = JSON.parse(readFileSync(0,"utf8"));
    if (!Array.isArray(peticiones) || peticiones.length !== 5 || !peticiones.every(p => Array.isArray(p) && p.length===3 && p.every(x => typeof x==="string"))) throw Error();
    const dir = process.env.CNE_MOVIL_PADRON_DIR;
    const clave = readFileSync(join(dir,"clave"));
    let filas;
    try { filas = descifrar(readFileSync(join(dir,"padron.cne")),clave); } finally { clave.fill(0); }
    const nombres = peticiones.map(([nombre]) => normalizar(nombre));
    const coincidencias = nombres.map(() => []);
    for (const [cedula,fila] of filas) {
      const i = nombres.indexOf(normalizar(fila.nombre));
      if (i !== -1) {
        const [, junta, zona] = peticiones[i];
        const encaja = fila.junta?.replace(/^([MF])(\d+)$/,"$2$1") === junta && normalizar(fila.zona ?? "") === normalizar(zona)
          && normalizar(fila.recinto) === normalizar("Caja Mágica");
        coincidencias[i].push(encaja ? cedula.slice(0,5) + "****" + cedula.slice(-1) : null);
      }
    }
    filas.clear();
    process.stdout.write(JSON.stringify(coincidencias.map(r => r.length === 1 ? r[0] : null)));
  } catch {
    process.stderr.write("No se pudo verificar la vista previa.\n");
    process.exitCode = 1;
  }
' < "$t/consulta.json" > "$t/resultado.json"
openssl cms -encrypt -binary -aes256 -in "$t/resultado.json" -outform DER -out "$t/resultado.cms" "$t/respuesta.pem"
printf 'VISTA_PREVIA_CIFRADA='
base64 -w 0 "$t/resultado.cms"
printf '\n'
