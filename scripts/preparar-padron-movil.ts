import { createCipheriv, randomBytes } from "node:crypto";
import { mkdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { indexar, MARCA } from "../src/server/puesto-movil/formato";

export function prepararPadronMovil(filas: unknown, carpetaNueva: string): number {
  const registros = indexar(filas);
  const plain = Buffer.from(JSON.stringify(Array.from(registros, ([cedula, { verificarWeb, ...ficha }]) => ({ cedula, ...ficha, ...(verificarWeb ? { verificarWeb } : {}) }))));
  const clave = randomBytes(32), nonce = randomBytes(12);
  try {
    const gcm = createCipheriv("aes-256-gcm", clave, nonce);
    gcm.setAAD(MARCA);
    const ciphertext = gcm.update(plain);
    gcm.final();
    mkdirSync(carpetaNueva, { mode: 0o700 });
    try {
      writeFileSync(join(carpetaNueva, "padron.cne"), Buffer.concat([MARCA, nonce, gcm.getAuthTag(), ciphertext]), { flag: "wx", mode: 0o600 });
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
  } finally { plain.fill(0); clave.fill(0); }
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
