import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { POST as buscar } from "@/app/api/d/buscar/route";
import { POST as foto } from "@/app/api/d/foto/route";
import { closePools } from "@/server/db";
import type { Sesion } from "@/server/auth";
import { borrarTodasLasFotos, buscarPorCedula, estadoDocumentos, guardarDocumento, leerDocumento, LIMITE_PUBLICO, resumenFotos } from "@/server/documentos";
import { consultarDueno, reiniciarBase } from "./helpers/db";

// Foto ficticia de ruido: pesa lo bastante y cada una es distinta.
async function imagen(ancho = 1000, alto = 650): Promise<Buffer> {
  return sharp(randomBytes(ancho * alto * 3), { raw: { width: ancho, height: alto, channels: 3 } }).jpeg({ quality: 70 }).toBuffer();
}
const peticion = (url: string, cuerpo: BodyInit, ip = "203.0.113.1", json = false) =>
  new Request(`http://localhost${url}`, { method: "POST", body: cuerpo, headers: { "cf-connecting-ip": ip, ...(json ? { "content-type": "application/json" } : {}) } });
const formulario = (lado: string, cedula: string, img: Buffer) => { const f = new FormData(); f.set("lado", lado); f.set("cedula", cedula); f.set("imagen", new File([new Uint8Array(img)], "x.jpg", { type: "image/jpeg" })); return f; };

let id: number;
let original: Buffer;
describe("documentos de identidad", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id) SELECT '0000000001','APELLIDO PRUEBA 001','NOMBRE PRUEBA','VOCAL','vocal',id FROM cne.juntas_madrid WHERE serie='H' AND numero=12");
    id = (await consultarDueno<{ id: number }>("SELECT id FROM cne.mjrv"))[0].id;
  });
  afterAll(closePools);

  it("guarda cifrado: en la base no hay un JPEG legible y descifra ida y vuelta", async () => {
    original = await imagen();
    const r = await guardarDocumento({ mjrvId: id, lado: "anverso", imagen: original, origen: "estacion" });
    expect(r).toMatchObject({ ok: true, estado: { anverso: true, reverso: false, completos: false } });
    const [fila] = await consultarDueno<{ imagen_cifrada: Buffer; bytes: number; ancho: number; es_prueba: boolean }>("SELECT imagen_cifrada, bytes, ancho, es_prueba FROM cne.documentos_mjrv");
    expect(fila.imagen_cifrada.subarray(16, 19).toString("hex")).not.toBe("ffd8ff"); // tras la etiqueta de 16 bytes no empieza como JPEG
    expect(fila.ancho).toBeLessThanOrEqual(1200);
    expect(fila.es_prueba).toBe(true);
    const claro = (await leerDocumento(id, "anverso"))!;
    expect(claro.subarray(0, 3).toString("hex")).toBe("ffd8ff");
    expect(claro.length).toBe(fila.bytes);
    // El texto cifrado no contiene el principio de la imagen en claro.
    expect(fila.imagen_cifrada.includes(claro.subarray(0, 64))).toBe(false);
  });

  it("el reverso idéntico al anverso se rechaza; uno distinto completa el expediente y repetir sustituye", async () => {
    expect(await guardarDocumento({ mjrvId: id, lado: "reverso", imagen: original, origen: "estacion" })).toMatchObject({ ok: false, status: 409 });
    expect(await guardarDocumento({ mjrvId: id, lado: "reverso", imagen: await imagen(), origen: "publico" })).toMatchObject({ ok: true, estado: { completos: true } });
    await guardarDocumento({ mjrvId: id, lado: "anverso", imagen: await imagen(), origen: "estacion" });
    expect((await consultarDueno("SELECT 1 FROM cne.documentos_mjrv")).length).toBe(2);
  });

  it("rechaza imágenes vacías, muy pequeñas o ilegibles", async () => {
    expect(await guardarDocumento({ mjrvId: id, lado: "anverso", imagen: Buffer.alloc(0), origen: "estacion" })).toMatchObject({ ok: false, status: 400 });
    expect(await guardarDocumento({ mjrvId: id, lado: "anverso", imagen: Buffer.alloc(30000, 1), origen: "estacion" })).toMatchObject({ ok: false, status: 400 });
    expect(await guardarDocumento({ mjrvId: id, lado: "anverso", imagen: Buffer.alloc(2_100_000, 1), origen: "estacion" })).toMatchObject({ ok: false, status: 400 });
  });

  it("formulario cerrado → 403; abierto → solo iniciales y junta", async () => {
    expect((await buscar(peticion("/api/d/buscar", JSON.stringify({ cedula: "0000000001" }), "203.0.113.5", true))).status).toBe(403);
    await consultarDueno("UPDATE cne.configuracion SET documentos_publico_abierto = true");
    const r = await buscar(peticion("/api/d/buscar", JSON.stringify({ cedula: "0000000001" }), "203.0.113.5", true));
    expect(await r.json()).toEqual({ encontrada: true, iniciales: "N. A.", junta: "H12", anverso: true, reverso: true });
    expect(await (await buscar(peticion("/api/d/buscar", JSON.stringify({ cedula: "9999999999" }), "203.0.113.5", true))).json()).toEqual({ encontrada: false });
    expect((await buscarPorCedula("0000000001"))?.nombre).toBe("APELLIDO PRUEBA 001, NOMBRE PRUEBA");
  });

  it("subida pública por la ruta; 10 consultas por IP cada 15 minutos", async () => {
    const r = await foto(peticion("/api/d/foto", formulario("anverso", "0000000001", await imagen()), "203.0.113.9"));
    expect(r.status).toBe(200);
    expect((await foto(peticion("/api/d/foto", formulario("anverso", "9999999999", await imagen()), "203.0.113.9"))).status).toBe(404);
    for (let i = 0; i < LIMITE_PUBLICO; i++) await buscar(peticion("/api/d/buscar", JSON.stringify({ cedula: "0000000001" }), "203.0.113.77", true));
    expect((await buscar(peticion("/api/d/buscar", JSON.stringify({ cedula: "0000000001" }), "203.0.113.77", true))).status).toBe(429);
    // Otra IP no se ve afectada.
    expect((await buscar(peticion("/api/d/buscar", JSON.stringify({ cedula: "0000000001" }), "203.0.113.78", true))).status).toBe(200);
  });

  describe("D13 · borrar todas las fotos (superadmin)", () => {
    const sup: Sesion = { sesionId: "x", usuarioId: 1, correo: "s@x.y", nombre: "Superadmin Prueba", tipo: "superadmin", rol: "consul", debeCambiar: false };
    it("sin la frase exacta no borra nada; solo la superadmin", async () => {
      await guardarDocumento({ mjrvId: id, lado: "anverso", imagen: await imagen(), origen: "estacion" });
      await guardarDocumento({ mjrvId: id, lado: "reverso", imagen: await imagen(), origen: "estacion" });
      const antes = (await consultarDueno("SELECT 1 FROM cne.documentos_mjrv")).length;
      expect(antes).toBeGreaterThanOrEqual(2);
      await expect(borrarTodasLasFotos({ ...sup, tipo: "madrid_admin" }, "BORRAR FOTOS")).rejects.toThrow("superadministración");
      expect(await borrarTodasLasFotos(sup, "borrar")).toMatchObject({ ok: false });
      expect((await consultarDueno("SELECT 1 FROM cne.documentos_mjrv")).length).toBe(antes);
      expect(await resumenFotos()).toMatchObject({ fotos: antes, personas: 1, sinPago: 1 });
    });

    it("con la frase borra solo las fotos del modo actual, deja auditoría con el recuento y las fotos se piden de nuevo", async () => {
      // Una foto «real» (otro modo) debe sobrevivir: se simula pasándola a es_prueba = false.
      await consultarDueno("INSERT INTO cne.documentos_mjrv (mjrv_id, lado, imagen_cifrada, nonce, bytes, ancho, alto, sha256, origen, es_prueba) VALUES ($1,'anverso','\\x00','\\x00',30000,10,10,decode(md5('real'),'hex'),'estacion', false) ON CONFLICT DO NOTHING", [id]);
      const prueba = (await consultarDueno("SELECT 1 FROM cne.documentos_mjrv WHERE es_prueba")).length;
      expect(await borrarTodasLasFotos(sup, "Borrar  fotos")).toEqual({ ok: true, borradas: prueba, personas: 1 });
      expect((await consultarDueno("SELECT 1 FROM cne.documentos_mjrv WHERE es_prueba")).length).toBe(0);
      expect((await consultarDueno("SELECT 1 FROM cne.documentos_mjrv WHERE NOT es_prueba")).length).toBe(1);
      const [a] = await consultarDueno<{ datos: { fotos: number; personas: number; sin_pago_confirmado: number }; actor_nombre: string }>("SELECT datos, actor_nombre FROM cne.auditoria WHERE accion = 'fotos_cedula_borradas'");
      expect(a).toMatchObject({ actor_nombre: "Superadmin Prueba", datos: { fotos: prueba, personas: 1, sin_pago_confirmado: 1 } });
      expect(await estadoDocumentos(id)).toMatchObject({ anverso: false, reverso: false, completos: false });
      expect(await resumenFotos()).toMatchObject({ fotos: 0, personas: 0 });
    });
  });
});
