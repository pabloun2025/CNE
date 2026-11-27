import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import configuracion from "./entrega-puesto-config.json";

const privado = { "cache-control": "private, no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow" };
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest();

export async function atenderEntrega(request: Request, config = configuracion, carpeta = join(tmpdir(), `entrega-cne-${config.id}`)) {
  const respuesta = (status: number) => new Response(null, { status, headers: privado });
  const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  const subida = request.method === "POST";
  const esperado = Buffer.from(subida ? config.subir : config.bajar, "hex");
  if (!token || !timingSafeEqual(esperado, hash(token))) return respuesta(404);
  if (Date.now() >= config.vence) {
    await rm(carpeta, { recursive: true, force: true });
    return respuesta(410);
  }

  if (subida) {
    const parte = request.headers.get("x-parte") ?? "";
    if (!/^(0|[1-9]\d?)$/.test(parte)) return respuesta(400);
    const datos = config.partes[Number(parte)];
    if (!datos || !request.body) return respuesta(400);
    const lector = request.body.getReader();
    const bloques: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.length;
      if (total > datos.size) {
        await lector.cancel();
        return respuesta(413);
      }
      bloques.push(value);
    }
    const bytes = Buffer.concat(bloques, total);
    if (total !== datos.size || !timingSafeEqual(hash(bytes), Buffer.from(datos.sha256, "hex"))) return respuesta(400);
    await mkdir(carpeta, { recursive: true, mode: 0o700 });
    const temporal = join(carpeta, randomUUID());
    try {
      await writeFile(temporal, bytes, { mode: 0o600, flag: "wx" });
      await rename(temporal, join(carpeta, parte));
    } finally { await rm(temporal, { force: true }); }
    return respuesta(204);
  }

  const partes = config.partes.map(({ size }, i) => ({ archivo: join(carpeta, String(i)), size }));
  for (const parte of partes) {
    const archivo = await stat(parte.archivo).catch(() => null);
    if (!archivo?.isFile() || archivo.size !== parte.size) return respuesta(425);
  }
  let indice = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const parte = partes[indice++];
      if (!parte) return controller.close();
      controller.enqueue(new Uint8Array(await readFile(parte.archivo)));
    },
  });
  return new Response(stream, { headers: { ...privado,
    "content-type": "application/octet-stream",
    "content-length": String(partes.reduce((suma, parte) => suma + parte.size, 0)),
    "x-content-type-options": "nosniff",
  } });
}
