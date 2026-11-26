import { createDecipheriv, createHash, createPublicKey, diffieHellman, hkdfSync, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { receptor } from "../justificante/servicio";
import { CIERRE_PADRON_MOVIL } from "./padron";
import { descifrar } from "./formato";
import config from "./provision-config.json";

const prefijo = Buffer.from("302a300506032b656e032100", "hex");
const contexto = Buffer.from("Madrid/CNE/puesto-movil/provision/v1");
const temporal = join(tmpdir(), "cne-puesto-movil-" + config.id);
function limpiar() {
  try { rmSync(temporal, { recursive: true, force: true }); }
  catch { console.warn("No se pudieron retirar las partes temporales del padrón móvil."); }
}
const limite = Math.min(config.vence, CIERRE_PADRON_MOVIL);
if (Date.now() < limite) setTimeout(limpiar, limite - Date.now()).unref();
else limpiar();

function huella(value: string | Buffer) {
  return createHash("sha256").update(value).digest();
}
function aceptar(token: string | undefined) {
  return token !== undefined && timingSafeEqual(huella(token), Buffer.from(config.acceso, "hex"));
}
function abrir(paquete: Buffer) {
  const eph = createPublicKey({ key: Buffer.concat([prefijo, paquete.subarray(0, 32)]), format: "der", type: "spki" });
  const salt = paquete.subarray(32, 44);
  const shared = diffieHellman({ privateKey: receptor(), publicKey: eph });
  const clave = Buffer.from(hkdfSync("sha256", shared, salt, contexto, 32));
  try {
    const cipher = createDecipheriv("aes-256-gcm", clave, salt);
    cipher.setAAD(contexto);
    cipher.setAuthTag(paquete.subarray(44, 60));
    const plain = cipher.update(paquete.subarray(60));
    try { cipher.final(); return plain; }
    catch (error) { plain.fill(0); throw error; }
  } finally { shared.fill(0); clave.fill(0); }
}

function instalar(dir: string) {
  if (Date.now() >= limite) return 410;
  const partes = config.partes.map((parte, i) => {
    const data = readFileSync(join(temporal, String(i)));
    if (data.length !== parte.size || !timingSafeEqual(huella(data), Buffer.from(parte.sha256, "hex"))) throw Error("Parte inválida.");
    return data;
  });
  const plain = abrir(Buffer.concat(partes));
  try {
    const clave = plain.subarray(0, 32), acceso = plain.subarray(32, 96), padron = plain.subarray(96);
    descifrar(padron, clave).clear();
    if (Date.now() >= limite) return 410;
    for (const [nombre, data] of [["padron.cne", padron], ["clave", clave], ["acceso.bin", acceso]] as const) {
      const destino = join(/* turbopackIgnore: true */ dir, nombre);
      const preparado = destino + "." + randomUUID();
      try { writeFileSync(preparado, data, { mode: 0o600, flag: "wx" }); renameSync(preparado, destino); }
      finally { rmSync(preparado, { force: true }); }
    }
  } finally { plain.fill(0); limpiar(); }
  return 204;
}

export async function aprovisionar(request: Request) {
  const responder = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });
  const dir = process.env.CNE_MOVIL_PADRON_DIR;
  const token = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!dir || !aceptar(token) || existsSync(join(/* turbopackIgnore: true */ dir, "acceso.bin"))) return responder(404);
  if (Date.now() >= limite) return responder(410);
  const id = request.headers.get("x-parte") ?? "";
  if (id === "publicar") {
    if (!config.partes.every((_, i) => existsSync(join(temporal, String(i))))) return responder(409);
    try { return responder(instalar(dir)); } catch { return responder(422); }
  }
  if (!/^[0-9]$/.test(id)) return responder(400);
  const parte = config.partes[Number(id)];
  const reader = request.body?.getReader();
  if (!parte || !reader) return responder(400);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > parte.size) { await reader.cancel(); return responder(413); }
    chunks.push(value);
  }
  const data = Buffer.concat(chunks);
  if (bytes !== parte.size || !timingSafeEqual(huella(data), Buffer.from(parte.sha256, "hex"))) return responder(400);
  if (Date.now() >= limite) return responder(410);
  if (existsSync(join(/* turbopackIgnore: true */ dir, "acceso.bin"))) return responder(404);
  mkdirSync(temporal, { recursive: true, mode: 0o700 });
  writeFileSync(join(temporal, id), data, { mode: 0o600 });
  return responder(204);
}
