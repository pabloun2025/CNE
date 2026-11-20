import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { CFB } from "xlsx";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { guardarDocumento } from "@/server/documentos";
import { confirmarPago, fichaPago, generarActa, generarRecibosContingencia, type ActorPago } from "@/server/finanzas";
import { fijarModoRecibo, guardarFirma } from "@/server/impresion-actas";
import { buscarRecibos, descargarRecibo, descargarSeleccionRecibos } from "@/server/recibos";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const foto = () => sharp(randomBytes(600 * 400 * 3), { raw: { width: 600, height: 400, channels: 3 } }).jpeg().toBuffer();

async function contieneTexto(pdf: Uint8Array, texto: string) {
  const doc = await PDFDocument.load(pdf);
  const pagina = doc.getPage(0).node.Contents();
  const stream = pagina instanceof PDFArray ? pagina.lookup(0, PDFRawStream) : pagina;
  if (!(stream instanceof PDFRawStream)) throw new Error("Falta el contenido de la primera página");
  const comandos = Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii");
  return comandos.includes(Buffer.from(texto, "latin1").toString("hex").toUpperCase());
}

describe("archivo de recibos de Madrid", () => {
  let actor: ActorPago;
  let sesion: Sesion;
  let persona: number;
  let segunda: number;
  beforeAll(async () => {
    await reiniciarBase();
    const [u] = await consultarDueno<{ id: number }>("INSERT INTO cne.usuarios (tipo, rol, correo, nombre, password_hash) VALUES ('madrid_admin','financiero','fin@example.invalid','Fin Prueba','x') RETURNING id");
    actor = { enlaceId: null, operadorId: null, operadorNombre: "Fin Prueba", usuarioId: u.id };
    sesion = { sesionId: "prueba", usuarioId: u.id, correo: "fin@example.invalid", nombre: "Fin Prueba", tipo: "madrid_admin", rol: "financiero", debeCambiar: false };
    await consultarDueno("UPDATE cne.parametros_pago SET importe_usd = 127.25, importe_eur = 55, pagador_nombre = 'PAGADOR PRUEBA'");
    const ids = [];
    for (const cedula of ["0000000041", "0000000042"]) {
      const [m] = await consultarDueno<{ id: number }>(
        "INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id) SELECT $1,'APELLIDO PRUEBA','NOMBRE PRUEBA','VOCAL','vocal',id FROM cne.juntas_madrid WHERE serie='H' AND numero=1 RETURNING id",
        [cedula]);
      ids.push(m.id);
      await guardarDocumento({ mjrvId: m.id, lado: "anverso", imagen: await foto(), origen: "estacion" });
      await guardarDocumento({ mjrvId: m.id, lado: "reverso", imagen: await foto(), origen: "estacion" });
    }
    [persona, segunda] = ids;
  });
  afterAll(closePools);

  it("busca por número, cédula o nombre y conserva el recibo pagado aunque se borren las fotos", async () => {
    const acta = await generarActa(actor, persona, true);
    expect(acta).toMatchObject({ ok: true, borrador: false });
    if (!acta.ok || acta.actaId === null) throw new Error("Falta el acta");
    expect(await contieneTexto(acta.pdf, "USD 127.25")).toBe(true);
    expect(await contieneTexto(acta.pdf, "EUR 55.00")).toBe(true);
    await consultarDueno("UPDATE cne.parametros_pago SET importe_usd = 200, importe_eur = 90");
    const otraActa = await generarActa(actor, persona, true);
    expect(otraActa).toMatchObject({ ok: true, actaId: acta.actaId, numero: acta.numero });
    if (!otraActa.ok) throw new Error("Falta la reimpresión");
    expect(await contieneTexto(otraActa.pdf, "USD 127.25")).toBe(true);
    expect(await contieneTexto(otraActa.pdf, "EUR 55.00")).toBe(true);
    expect(await confirmarPago(actor, { mjrvId: persona, actaId: acta.actaId, verificado: true }))
      .toMatchObject({ ok: true, importeUsd: "127.25", importeEur: "55.00" });
    await consultarDueno("DELETE FROM cne.documentos_mjrv WHERE mjrv_id = $1", [persona]);
    expect((await fichaPago("0000000041"))?.importeEur).toBe("55.00");
    for (const q of [acta.numero, "0000000041", "NOMBRE PRUEBA"]) {
      expect((await buscarRecibos(q, 1)).filas).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: acta.actaId, tipo: "acta", importe: "55.00", pagado: true, reconstruido: false }),
      ]));
    }
    const recibo = await descargarRecibo("acta", acta.actaId);
    expect(recibo?.numero).toBe(acta.numero);
    expect((await PDFDocument.load(recibo!.pdf)).getPageCount()).toBe(1);
    expect(await contieneTexto(recibo!.pdf, "USD 127.25")).toBe(true);
    expect(await consultarDueno("SELECT id FROM cne.actas_pago")).toHaveLength(1);
    expect(await consultarDueno("SELECT id FROM cne.pagos_confirmados")).toHaveLength(1);
    await consultarDueno("UPDATE cne.configuracion SET modo = 'eleccion'");
    try {
      expect((await buscarRecibos(acta.numero, 1)).filas).toEqual([]);
      expect(await descargarRecibo("acta", acta.actaId)).toBeNull();
    } finally {
      await consultarDueno("UPDATE cne.configuracion SET modo = 'prueba'");
    }
    await consultarDueno("UPDATE cne.actas_pago SET recibo_cifrado = NULL, recibo_nonce = NULL WHERE id = $1", [acta.actaId]);
    expect((await buscarRecibos(acta.numero, 1)).filas).toMatchObject([{ reconstruido: true }]);
    const reconstruido = (await descargarRecibo("acta", acta.actaId))!;
    expect((await PDFDocument.load(reconstruido.pdf)).getPageCount()).toBe(1);
    expect(await contieneTexto(reconstruido.pdf, "USD 127.25")).toBe(true);
  });

  it("muestra una firma nueva una sola vez y mantiene descargables los PDF firmados anteriores", async () => {
    await fijarModoRecibo("digital");
    const firma = await sharp({ create: { width: 80, height: 40, channels: 4, background: "#171717" } }).png().toBuffer();
    expect(await guardarFirma(actor, segunda, firma)).toEqual({ ok: true });
    const nuevas = (await buscarRecibos("0000000042", 1)).filas;
    expect(nuevas).toMatchObject([{ tipo: "acta", reconstruido: false }]);
    await consultarDueno("UPDATE cne.firmas_recibo SET acta_id = NULL WHERE mjrv_id = $1", [segunda]);
    const [firmada] = (await buscarRecibos("0000000042", 1)).filas.filter((f) => f.tipo === "firma");
    expect(firmada).toMatchObject({ pagado: null });
    expect((await PDFDocument.load((await descargarRecibo("firma", firmada.id))!.pdf)).getPageCount()).toBe(1);
  });

  it("emite y reimprime un lote sin fotos ni validación, con un número por persona y sin registrar pagos", async () => {
    const ids = [];
    for (const cedula of ["0000000043", "0000000044"]) {
      const [fila] = await consultarDueno<{ id: number }>(
        "INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id) SELECT $1,'CONTINGENCIA','NOMBRE PRUEBA','VOCAL','vocal',id FROM cne.juntas_madrid WHERE serie='H' AND numero=1 RETURNING id",
        [cedula]);
      ids.push(fila.id);
    }
    const [lote, repetido] = await Promise.all([
      generarRecibosContingencia(actor, [...ids, ids[0]]),
      generarRecibosContingencia(actor, [...ids].reverse()),
    ]);
    if (!lote.ok || !repetido.ok) throw new Error("El lote de contingencia debe estar disponible");
    expect(lote.numeros).toEqual(repetido.numeros);
    expect(new Set(lote.numeros).size).toBe(2);
    expect((await PDFDocument.load(lote.pdf)).getPageCount()).toBe(2);
    expect(await consultarDueno("SELECT id FROM cne.actas_pago WHERE mjrv_id = ANY($1::bigint[])", [ids])).toHaveLength(2);
    await expect(consultarDueno(
      "INSERT INTO cne.actas_pago (mjrv_id, usuario_id, importe_eur, parametros, impresion_n) VALUES ($1,$2,55,'{}',1)",
      [ids[0], actor.usuarioId])).rejects.toMatchObject({ code: "23505" });
    expect(await consultarDueno("SELECT id FROM cne.pagos_confirmados WHERE mjrv_id = ANY($1::bigint[])", [ids])).toHaveLength(0);
    expect(await consultarDueno("SELECT id FROM cne.mjrv WHERE id = ANY($1::bigint[]) AND cedula_validada_en IS NOT NULL", [ids])).toHaveLength(0);
    const [acta] = (await buscarRecibos(lote.numeros[0], 1)).filas;
    expect(await confirmarPago(actor, { mjrvId: ids[0], actaId: acta.id, verificado: true })).toMatchObject({ ok: false });
  });

  it("completa un recibo legado sin importe usando el importe configurado y el número que ya tenía", async () => {
    const [fila] = await consultarDueno<{ id: number }>(
      "INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id) SELECT '0000000045','LEGADO','NOMBRE PRUEBA','VOCAL','vocal',id FROM cne.juntas_madrid WHERE serie='H' AND numero=1 RETURNING id");
    const [legado] = await consultarDueno<{ id: number }>(
      "INSERT INTO cne.actas_pago (mjrv_id, usuario_id, parametros, impresion_n) VALUES ($1,$2,'{}',1) RETURNING id",
      [fila.id, actor.usuarioId]);
    const copia = (await descargarRecibo("acta", legado.id))!;
    expect(await contieneTexto(copia.pdf, "EUR 90.00")).toBe(false);
    expect(await contieneTexto(copia.pdf, "USD 200.00")).toBe(false);
    const descarga = await descargarSeleccionRecibos(sesion, { modo: "prueba", referencias: [{ tipo: "acta", id: legado.id }] });
    if (!descarga.ok || descarga.tipo !== "application/pdf") throw new Error("Falta la copia histórica");
    expect(await contieneTexto(descarga.contenido, "EUR 90.00")).toBe(false);
    expect(await contieneTexto(descarga.contenido, "USD 200.00")).toBe(false);
    for (const lado of ["anverso", "reverso"] as const) {
      expect(await guardarDocumento({ mjrvId: fila.id, lado, imagen: await foto(), origen: "estacion" })).toMatchObject({ ok: true });
    }
    const reimpresion = await generarActa(actor, fila.id, true);
    expect(reimpresion).toMatchObject({ ok: true, actaId: legado.id, borrador: true });
    if (!reimpresion.ok) throw new Error("Falta la reimpresión histórica");
    expect(await contieneTexto(reimpresion.pdf, "EUR 90.00")).toBe(false);
    expect(await contieneTexto(reimpresion.pdf, "USD 200.00")).toBe(false);
    expect(await consultarDueno("SELECT importe_eur, importe_usd FROM cne.actas_pago WHERE id = $1", [legado.id]))
      .toEqual([{ importe_eur: null, importe_usd: null }]);
    expect(await generarRecibosContingencia(actor, [fila.id])).toMatchObject({
      ok: true, numeros: [`PRUEBA-${String(legado.id).padStart(6, "0")}`],
    });
    expect(await consultarDueno("SELECT id, importe_eur::text AS importe, importe_usd::text AS usd FROM cne.actas_pago WHERE mjrv_id = $1", [fila.id]))
      .toEqual([{ id: legado.id, importe: "90.00", usd: null }]);
    expect(await contieneTexto((await descargarRecibo("acta", legado.id))!.pdf, "USD 200.00")).toBe(false);
  });

  it("descarga todos los recibos que coinciden más allá de la primera página y audita cada archivo", async () => {
    await consultarDueno(`INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id)
      SELECT lpad(i::text, 10, '0'), 'LOTE FILTRADO PRUEBA', 'NOMBRE PRUEBA', 'VOCAL', 'vocal', id
        FROM cne.juntas_madrid, generate_series(100, 130) i WHERE serie = 'H' AND numero = 1`);
    const ids = await consultarDueno<{ id: number }>(`INSERT INTO cne.actas_pago (mjrv_id, usuario_id, importe_eur, parametros, impresion_n)
      SELECT m.id, $1, 43.12, '{"pagador_nombre":"PAGADOR PRUEBA"}', 1
        FROM cne.mjrv m WHERE apellidos = 'LOTE FILTRADO PRUEBA' RETURNING id`, [actor.usuarioId]);
    const pagina = await buscarRecibos("lote filtrado", 1);
    expect(pagina).toMatchObject({ modo: "prueba", total: 31, siguiente: true });
    expect(pagina.filas).toHaveLength(30);
    const resultado = await descargarSeleccionRecibos(sesion, { modo: "prueba", q: "lote filtrado", total: 31 });
    expect(resultado).toMatchObject({ ok: true, tipo: "application/zip" });
    if (!resultado.ok) throw new Error("Falta el ZIP");
    const zip = CFB.read(Buffer.from(await new Response(resultado.contenido).arrayBuffer()), { type: "buffer" });
    const archivos = (zip.FileIndex as { name: string; content: Uint8Array }[]).filter(({ name }) => name.endsWith(".pdf"));
    expect(archivos.map(({ name }) => name).sort()).toEqual(ids.map(({ id }) => `recibo-PRUEBA-${String(id).padStart(6, "0")}.pdf`).sort());
    expect(await contieneTexto(archivos[0].content, "EUR 43.12")).toBe(true);
    const auditoria = await consultarDueno<{ id: number }>(`SELECT entidad_id::bigint AS id FROM cne.auditoria
       WHERE accion = 'recibo_descargado' AND entidad = 'actas_pago' AND actor_id = $1 AND entidad_id::bigint >= $2 ORDER BY id`,
    [sesion.usuarioId, Math.min(...ids.map(({ id }) => id))]);
    expect(auditoria).toEqual(ids.sort((a, b) => a.id - b.id));
    expect(await descargarSeleccionRecibos(sesion, { modo: "eleccion", q: "lote filtrado", total: 31 })).toMatchObject({ ok: false, status: 409 });
    expect(await descargarSeleccionRecibos(sesion, { modo: "prueba", q: "lote filtrado", total: 30 })).toMatchObject({ ok: false, status: 409 });
    expect(await descargarSeleccionRecibos(sesion, { modo: "prueba", referencias: [{ tipo: "acta", id: ids[0].id }] }))
      .toMatchObject({ ok: true, tipo: "application/pdf", nombre: `recibo-PRUEBA-${String(ids[0].id).padStart(6, "0")}.pdf` });
    expect(await descargarSeleccionRecibos(sesion, { modo: "prueba", referencias: [{ tipo: "acta", id: ids[0].id }, { tipo: "acta", id: 99999 }] }))
      .toMatchObject({ ok: false, status: 404 });
  });
});
