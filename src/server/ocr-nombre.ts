import os from "node:os";
import path from "node:path";
import { createWorker, type Worker } from "tesseract.js";

// Un solo lector, en serie: dos puertas no arrancan dos motores a la vez.
// Si no puede leer, devuelve vacío y en la puerta se teclea el nombre.
let motor: Promise<Worker> | null = null;
let cola: Promise<unknown> = Promise.resolve();

function trabajador(): Promise<Worker> {
  if (!motor) {
    motor = createWorker("spa", 1, { cachePath: path.join(os.tmpdir(), "cne-tessdata") }).catch((error: unknown) => {
      motor = null;
      throw error;
    });
  }
  return motor;
}

async function reconocer(imagen: Buffer): Promise<string> {
  try {
    const worker = await trabajador();
    const { data } = await worker.recognize(imagen);
    return (data.text ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  } catch {
    return "";
  }
}

export function textoDeImagen(imagen: Buffer): Promise<string> {
  const turno = cola.then(() => reconocer(imagen), () => reconocer(imagen));
  cola = turno.then(() => undefined, () => undefined);
  return turno;
}
