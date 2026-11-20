import { createRequire } from "node:module";
import path from "node:path";
import { createWorker, type Worker } from "tesseract.js";

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
  });
}

async function reconocer(imagen: Buffer): Promise<string> {
  try {
    const worker = await trabajador();
    const { data } = await worker.recognize(imagen);
    return (data.text ?? "").trim().slice(0, 500);
  } catch {
    return "";
  }
}

export function textoDeImagen(imagen: Buffer): Promise<string> {
  const turno = cola.then(() => reconocer(imagen), () => reconocer(imagen));
  cola = turno.then(() => undefined, () => undefined);
  return turno;
}
