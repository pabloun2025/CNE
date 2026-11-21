import { createRequire } from "node:module";
import path from "node:path";
import sharp from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";

// Un solo lector, en serie: dos puertas no arrancan dos motores a la vez.
// Si no puede leer, la puerta permite teclear la cédula.
let motor: Promise<Worker> | null = null;
let cola: Promise<unknown> = Promise.resolve();

function trabajador(): Promise<Worker> {
  return motor ??= new Promise<Worker>((resolver, rechazar) => {
    const paquete = createRequire(path.join(process.cwd(), "package.json")).resolve("@tesseract.js-data/spa");
    const langPath = path.join(path.dirname(paquete), "4.0.0_best_int");
    // El idioma va con la aplicación. Tesseract 5 comunica fallos de idioma por errorHandler.
    void createWorker("spa", 1, { langPath, cacheMethod: "none", errorHandler: rechazar }).then(resolver, rechazar);
  }).then(async (worker) => {
    try {
      // La credencial contiene varios bloques separados por el logotipo, la junta y la silueta.
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      return worker;
    } catch (error) {
      await worker.terminate().catch(() => undefined);
      throw error;
    }
  }).catch((error) => {
    motor = null;
    throw error;
  });
}

async function reconocer(imagen: Buffer): Promise<string> {
  const preparada = await sharp(imagen, { limitInputPixels: 2_000_000 })
    .grayscale().normalise().resize({ width: 900, height: 900, fit: "inside" }).png().toBuffer().catch(() => null);
  if (!preparada) return "";
  const worker = await trabajador();
  const { data } = await worker.recognize(preparada);
  return (data.text ?? "").trim().slice(0, 500);
}

export function textoDeImagen(imagen: Buffer, signal?: AbortSignal): Promise<string> {
  const turno = cola.then(() => signal?.aborted ? "" : reconocer(imagen));
  cola = turno.then(() => undefined, () => undefined);
  return turno;
}
