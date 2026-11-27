import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { POST as buscar } from "@/app/api/d/buscar/route";
import { POST as foto } from "@/app/api/d/foto/route";
import { closePools } from "@/server/db";
import type { Sesion } from "@/server/auth";
import { borrarTodasLasFotos, buscarPorCedula, documentosParaRecibo, estadoDocumentos, guardarDocumento, leerDocumento, listarDocumentosFinanzas, LIMITE_PUBLICO, resumenFotos } from "@/server/documentos";
import { consultarDueno, reiniciarBase } from "./helpers/db";

// Foto ficticia de ruido: pesa lo bastante y cada una es distinta.
async function imagen(ancho = 1000, alto = 650): Promise<Buffer> {
  return sharp(randomBytes(ancho * alto * 3), { raw: { width: ancho, height: alto, channels: 3 } }).jpeg({ quality: 70 }).toBuffer();
}
const peticion = (url: string, cuerpo: BodyInit, ip = "203.0.113.1", json = false) =>
  new Request(`http://localhost${url}`, { method: "POST", body: cuerpo, headers: { "cf-connecting-ip": ip, ...(json ? { "content-type": "application/json" } : {}) } });
function formulario(lado: string, cedula: string, img: Buffer, numeroPasaporte?: string) {
  const f = new FormData();
  f.set("lado", lado);
  f.set("cedula", cedula);
  f.set("imagen", new File([new Uint8Array(img)], "x.jpg", { type: "image/jpeg" }));
  if (numeroPasaporte !== undefined) f.set("numeroPasaporte", numeroPasaporte);
  return f;
}

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

  it("el enlace fijo permite buscar aunque el ajuste antiguo sea falso; expone solo iniciales y junta", async () => {
    await consultarDueno("UPDATE cne.configuracion SET documentos_publico_abierto = false");
    const r = await buscar(peticion("/api/d/buscar", JSON.stringify({ cedula: "0000000001" }), "203.0.113.5", true));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ encontrada: true, iniciales: "N. A.", junta: "M12", anverso: true, reverso: true });
    expect(await (await buscar(peticion("/api/d/buscar", JSON.stringify({ cedula: "9999999999" }), "203.0.113.5", true))).json()).toEqual({ encontrada: false });
    expect((await buscarPorCedula("0000000001"))?.nombre).toBe("APELLIDO PRUEBA 001, NOMBRE PRUEBA");
  });

  it("recibe ambas caras sin activar el ajuste antiguo y conserva el límite de consultas por IP", async () => {
    await consultarDueno("UPDATE cne.configuracion SET documentos_publico_abierto = false");
    const r = await foto(peticion("/api/d/foto", formulario("anverso", "0000000001", await imagen()), "203.0.113.9"));
    expect(r.status).toBe(200);
    const reverso = await foto(peticion("/api/d/foto", formulario("reverso", "0000000001", await imagen()), "203.0.113.9"));
    expect(await reverso.json()).toEqual({ ok: true, anverso: true, reverso: true, completos: true });
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

  it("al elegir pasaporte basta una foto vinculada a la cédula y solo sustituye fotos del modo actual", async () => {
    const subir = (datos: FormData) => foto(peticion("/api/d/foto", datos, "203.0.113.52"));
    const cedula = "0000000002";
    const [{ id: ficha }] = await consultarDueno<{ id: number }>(
      `INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id)
       SELECT $1, 'APELLIDO PRUEBA 002', 'NOMBRE PRUEBA', 'VOCAL', 'vocal', id FROM cne.juntas_madrid WHERE serie = 'M' AND numero = 12
       RETURNING id`, [cedula]);
    await consultarDueno(
      `INSERT INTO cne.documentos_mjrv (mjrv_id, lado, imagen_cifrada, nonce, bytes, ancho, alto, sha256, origen, es_prueba)
       VALUES ($1, 'anverso', decode('00', 'hex'), decode('00', 'hex'), 30000, 10, 10, decode(md5('foto ficticia'), 'hex'), 'estacion', false)`, [ficha]);
    const anverso = await imagen();
    const pagina = await imagen();
    await guardarDocumento({ mjrvId: ficha, lado: "anverso", imagen: anverso, origen: "estacion" });
    expect((await subir(formulario("pasaporte", cedula, Buffer.alloc(0)))).status).toBe(400);
    expect(await estadoDocumentos(ficha)).toEqual({ anverso: true, reverso: false, completos: false });

    const r = await subir(formulario("pasaporte", cedula, pagina));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, anverso: false, reverso: false, pasaporte: true, completos: true });
    const consulta = await buscar(peticion("/api/d/buscar", JSON.stringify({ cedula }), "203.0.113.52", true));
    expect(await consulta.json()).toEqual({ encontrada: true, iniciales: "N. A.", junta: "F12", anverso: false, reverso: false, pasaporte: true });
    expect(await buscarPorCedula("PRUEBA025")).toBeNull();
    const doc = await documentosParaRecibo(ficha);
    expect(doc).toEqual({ pasaporte: await leerDocumento(ficha, "pasaporte") });
    expect((await subir(formulario("pasaporte", cedula, pagina, "CAMPO-ANTERIOR"))).status).toBe(200);
    expect(await consultarDueno("SELECT lado, es_prueba, numero_pasaporte FROM cne.documentos_mjrv WHERE mjrv_id = $1 ORDER BY es_prueba", [ficha])).toEqual([
      { lado: "anverso", es_prueba: false, numero_pasaporte: null },
      { lado: "pasaporte", es_prueba: true, numero_pasaporte: null },
    ]);

    expect((await subir(formulario("anverso", cedula, anverso))).status).toBe(200);
    expect(await estadoDocumentos(ficha)).toEqual({ anverso: true, reverso: false, completos: false });
    expect(await leerDocumento(ficha, "pasaporte")).toBeNull();
    expect(await documentosParaRecibo(ficha)).toEqual({ anverso: await leerDocumento(ficha, "anverso") });
  });

  it("lista origen, validación y fotos pendientes sin mezclar modos", async () => {
    const [{ id: falta }] = await consultarDueno<{ id: number }>(
      `INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id)
       SELECT '0000000003', 'APELLIDO PRUEBA 003', 'NOMBRE PRUEBA', 'VOCAL', 'vocal', id FROM cne.juntas_madrid
       WHERE serie = 'H' AND numero = 12 RETURNING id`);
    expect(await guardarDocumento({ mjrvId: id, lado: "pasaporte", imagen: await imagen(), origen: "estacion" })).toMatchObject({ ok: true });
    const listado = await listarDocumentosFinanzas();
    expect(listado.modo).toBe("prueba");
    const { buscarParaValidacion } = await import("@/server/documentos");
    expect(listado.fichas.find((f) => f.id === id)?.version).toBe((await buscarParaValidacion("0000000001"))?.version);
    expect(listado.fichas).toEqual(expect.arrayContaining([
      expect.objectContaining({ id, completos: true, pasaporte: true, estado: "por_validar", origen: "personal" }),
      expect.objectContaining({ cedula: "0000000002", completos: false, anverso: true, estado: "incompleto", origen: "mjrv" }),
      expect.objectContaining({ id: falta, completos: false, anverso: false, reverso: false, estado: "sin_documento", origen: null }),
    ]));
    const { validarCedula } = await import("@/server/mjrv");
    expect(await validarCedula({ tipo: "usuario", id: 1, nombre: "Prueba documental", portal: "finanzas" }, id)).toMatchObject({ ok: true });
    expect((await listarDocumentosFinanzas()).fichas.find((f) => f.id === id)?.estado).toBe("validado");
    await guardarDocumento({ mjrvId: id, lado: "pasaporte", imagen: await imagen(), origen: "publico" });
    expect((await listarDocumentosFinanzas()).fichas.find((f) => f.id === id)).toMatchObject({ estado: "por_validar", origen: "mjrv" });
    await consultarDueno("UPDATE cne.configuracion SET modo = 'eleccion'");
    const eleccion = await listarDocumentosFinanzas();
    expect(eleccion.modo).toBe("eleccion");
    expect(eleccion.fichas.find((f) => f.id === id)).toMatchObject({ anverso: true, reverso: false, completos: false });
    expect(eleccion.fichas.find((f) => f.id === id)?.pasaporte).toBeUndefined();
    expect(await guardarDocumento({ mjrvId: falta, lado: "pasaporte", imagen: await imagen(), origen: "estacion", modoEsperado: "prueba" })).toMatchObject({ ok: false, status: 409 });
  });
});
