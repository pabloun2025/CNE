import { PassThrough, Readable } from "node:stream";
import { ZipFile } from "yazl";

type ArchivoZip = { nombre: string; bytes: Uint8Array | (() => Promise<Uint8Array>) };

export function crearZip(archivos: ArchivoZip[]): ReadableStream<Uint8Array<ArrayBuffer>> {
  const zip = new ZipFile();
  const salida = zip.outputStream as PassThrough;
  const flujo = Readable.toWeb(salida) as ReadableStream<Uint8Array<ArrayBuffer>>;
  zip.on("error", (error: Error) => salida.destroy(error));
  for (const { nombre, bytes } of archivos) {
    if (typeof bytes === "function") {
      zip.addReadStreamLazy(nombre, { compress: false }, (listo) => {
        void bytes().then((pdf) => listo(null, Readable.from([pdf])), (error: Error) => listo(error, Readable.from([])));
      });
    } else {
      zip.addBuffer(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), nombre, { compress: false });
    }
  }
  zip.end();
  return flujo;
}
