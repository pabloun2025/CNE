const { createHash } = require("node:crypto");
const { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } = require("node:fs");
const { join } = require("node:path");

const { id, vence, partes } = JSON.parse(process.argv[2]);
if (!/^[a-f0-9]{20}$/.test(id)) process.exit(1);
if (Date.now() >= vence) process.exit(0);

const raiz = "/run/cne-padron-movil/entregas";
const carpeta = "entrega-cne-" + id;
const destino = join(raiz, carpeta);
const temporalAnterior = join("/tmp", carpeta);

function completa(ruta) {
  return partes.length > 0 && partes.every(({ size, sha256 }, indice) => {
    try {
      const datos = readFileSync(join(ruta, String(indice)));
      return datos.length === size && createHash("sha256").update(datos).digest("hex") === sha256;
    } catch { return false; }
  });
}

if (completa(destino)) {
  console.log("Descarga privada del puesto verificada en el volumen.");
} else {
  if (!completa(temporalAnterior)) {
    console.error("La descarga privada vigente no está completa en el contenedor actual.");
    process.exit(1);
  }
  mkdirSync(raiz, { recursive: true, mode: 0o700 });
  const temporal = mkdtempSync(join(raiz, ".traslado-"));
  try {
    partes.forEach((_, i) => copyFileSync(join(temporalAnterior, String(i)), join(temporal, String(i))));
    if (!completa(temporal)) throw Error("No se pudo verificar la copia cifrada del ZIP.");
    rmSync(destino, { recursive: true, force: true });
    renameSync(temporal, destino);
    console.log("Descarga privada del puesto conservada en el volumen.");
  } finally { rmSync(temporal, { recursive: true, force: true }); }
}
