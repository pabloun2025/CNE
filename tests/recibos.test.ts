import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { closePools } from "@/server/db";
import { guardarDocumento } from "@/server/documentos";
import { confirmarPago, generarActa, type ActorPago } from "@/server/finanzas";
import { fijarModoRecibo, guardarFirma } from "@/server/impresion-actas";
import { buscarRecibos, descargarRecibo } from "@/server/recibos";
import { consultarDueno, reiniciarBase } from "./helpers/db";

describe("archivo de recibos de Madrid", () => {
  let actor: ActorPago;
  let persona: number;
  let segunda: number;
  beforeAll(async () => {
    await reiniciarBase();
    const [u] = await consultarDueno<{ id: number }>("INSERT INTO cne.usuarios (tipo, rol, correo, nombre, password_hash) VALUES ('madrid_admin','financiero','fin@example.invalid','Fin Prueba','x') RETURNING id");
    actor = { enlaceId: null, operadorId: null, operadorNombre: "Fin Prueba", usuarioId: u.id };
    await consultarDueno("UPDATE cne.parametros_pago SET importe_eur = 55, pagador_nombre = 'PAGADOR PRUEBA'");
    const foto = () => sharp(randomBytes(600 * 400 * 3), { raw: { width: 600, height: 400, channels: 3 } }).jpeg().toBuffer();
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
    const otraActa = await generarActa(actor, persona, true);
    if (!otraActa.ok) throw new Error("Falta el acta adicional");
    expect(await confirmarPago(actor, { mjrvId: persona, actaId: acta.actaId, verificado: true })).toMatchObject({ ok: true });
    await consultarDueno("DELETE FROM cne.documentos_mjrv WHERE mjrv_id = $1", [persona]);
    await consultarDueno("UPDATE cne.parametros_pago SET importe_eur = 90");
    for (const q of [acta.numero, "0000000041", "NOMBRE PRUEBA"]) {
      expect((await buscarRecibos(q, 1)).filas).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: acta.actaId, tipo: "acta", importe: "55.00", pagado: true, reconstruido: false }),
      ]));
    }
    expect((await buscarRecibos(otraActa.numero, 1)).filas).toMatchObject([{ pagado: false }]);
    const recibo = await descargarRecibo("acta", acta.actaId);
    expect(recibo?.numero).toBe(acta.numero);
    expect((await PDFDocument.load(recibo!.pdf)).getPageCount()).toBe(1);
    expect(await consultarDueno("SELECT id FROM cne.actas_pago")).toHaveLength(2);
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
    expect((await PDFDocument.load((await descargarRecibo("acta", acta.actaId))!.pdf)).getPageCount()).toBe(1);
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
});
