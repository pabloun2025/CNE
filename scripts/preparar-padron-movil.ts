import { randomBytes } from "node:crypto";
import { mkdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { cifrar, indexar } from "../src/server/puesto-movil/formato";

export function prepararPadronMovil(filas: unknown, carpetaNueva: string): number {
  const registros = indexar(filas);
  const clave = randomBytes(32);
  try {
    const ciphertext = cifrar(registros, clave);
    mkdirSync(carpetaNueva, { mode: 0o700 });
    try {
      writeFileSync(join(carpetaNueva, "padron.cne"), ciphertext, { flag: "wx", mode: 0o600 });
      // Publicar la clave al final permite abrir solamente un padrón completo.
      writeFileSync(join(carpetaNueva, "clave"), clave, { flag: "wx", mode: 0o600 });
    } catch (e) {
      for (const nombre of ["clave", "padron.cne"]) {
        try { unlinkSync(join(carpetaNueva, nombre)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      }
      rmdirSync(carpetaNueva);
      throw e;
    }
    return registros.size;
  } finally { clave.fill(0); }
}

if (require.main === module) {
  try {
    const [importador, excel, destino] = process.argv.slice(2);
    if (!importador || !excel || !destino) throw Error();
    const ruta = resolve(importador);
    const cargar = createRequire(ruta)(ruta) as { importar(path: string): unknown };
    console.log(`Padrón móvil cifrado. Filas validadas: ${prepararPadronMovil(cargar.importar(resolve(excel)), resolve(destino))}.`);
  } catch {
    console.error("No se pudo preparar el padrón. Revise el importador, el Excel y la ruta de destino nueva.");
    process.exitCode = 1;
  }
}
