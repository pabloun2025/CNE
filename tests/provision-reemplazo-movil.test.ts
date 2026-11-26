import { createCipheriv, createHash, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { prepararPadronMovil } from "../scripts/preparar-padron-movil";
import { receptor } from "@/server/justificante/servicio";
import { CIERRE_PADRON_MOVIL, consultarPadronMovil } from "@/server/puesto-movil/padron";

const config = vi.hoisted(() => ({ id: "", vence: 0, acceso: "", reemplazo: true, partes: [] as { size: number; sha256: string }[] }));
vi.mock("@/server/puesto-movil/provision-config.json", () => ({ default: config }));
const hash = (dato: string | Buffer) => createHash("sha256").update(dato).digest("hex");

it("recibe un reemplazo cifrado, conserva el acceso al puesto y cierra la carga tras publicarlo", async () => {
  const temp = mkdtempSync(join(tmpdir(), "cne-provision-prueba-"));
  vi.useFakeTimers({ toFake: ["Date", "performance", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(CIERRE_PADRON_MOVIL - 60_000);
  config.id = randomBytes(10).toString("hex");
  config.vence = Date.now() + 30_000;
  const usuario = randomBytes(32).toString("base64url");
  config.acceso = hash(usuario);
  const ruta = join(temp, "activo");
  const destino = join(temp, "nuevo");
  const original = { cedula: "0000000001", nombre: "PERSONA DE PRUEBA", recinto: "Caja Mágica", junta: "M1", zona: "Amarillo" };
  try {
    prepararPadronMovil([original], ruta);
    prepararPadronMovil([{ ...original, recinto: "Zaragoza", junta: "F1", zona: "Zona Única" }], destino);
    const acceso = randomBytes(64);
    writeFileSync(join(ruta, "acceso.bin"), acceso, { mode: 0o600 });
    vi.stubEnv("CNE_MOVIL_PADRON_DIR", ruta);
    expect(consultarPadronMovil(original.cedula)?.recinto).toBe("Caja Mágica");

    const par = generateKeyPairSync("x25519");
    const contexto = Buffer.from("Madrid/CNE/puesto-movil/provision/v1");
    const nonce = randomBytes(12);
    const real = createPublicKey(receptor());
    const shared = diffieHellman({ privateKey: par.privateKey, publicKey: real });
    const clave = Buffer.from(hkdfSync("sha256", shared, nonce, contexto, 32));
    const cifrado = createCipheriv("aes-256-gcm", clave, nonce);
    cifrado.setAAD(contexto);
    const body = Buffer.concat([cifrado.update(readFileSync(join(destino,"clave"))),
      cifrado.update(readFileSync(join(destino,"padron.cne"))), cifrado.final()]);
    const paquete = Buffer.concat([par.publicKey.export({ type: "spki", format: "der" }).subarray(-32), nonce, cifrado.getAuthTag(), body]);
    config.partes = [{ size: paquete.length, sha256: hash(paquete) }];
    const { aprovisionar } = await import("@/server/puesto-movil/provision");
    const solicitar = (parte: string, token = usuario, datos?: Buffer) =>
      aprovisionar(new Request("https://prueba.invalid/api/puesto-movil/provision", {
        method: "POST", headers: { authorization: "Bearer " + token, "x-parte": parte },
        ...(datos ? { body: new Uint8Array(datos) } : {}),
      }));
    expect((await solicitar("publicar", "X".repeat(43))).status).toBe(404);
    expect((await solicitar("publicar")).status).toBe(409);
    expect((await solicitar("0", usuario, paquete)).status).toBe(204);
    expect((await solicitar("publicar")).status).toBe(204);
    expect(consultarPadronMovil(original.cedula)).toMatchObject({ recinto: "Zaragoza", junta: "F1", zona: "Zona Única" });
    expect(readFileSync(join(ruta, "acceso.bin"))).toEqual(acceso);
    expect((await solicitar("publicar")).status).toBe(404);
  } finally {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    rmSync(temp, { recursive: true, force: true });
  }
});
