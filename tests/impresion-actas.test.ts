import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { closePools } from "@/server/db";
import { guardarDocumento } from "@/server/documentos";
import type { ActorPago } from "@/server/finanzas";
import { escanearParaRecibo, fijarModoRecibo, guardarFirma, imprimirPendiente, leerModoRecibo, listarPendientes } from "@/server/impresion-actas";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const foto = () => sharp(randomBytes(900 * 600 * 3), { raw: { width: 900, height: 600, channels: 3 } }).jpeg({ quality: 70 }).toBuffer();
const firma = () => sharp({ create: { width: 80, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();

describe("impresión de actas", () => {
  let actor: ActorPago;
  let otro: ActorPago;
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.usuarios (tipo, rol, correo, nombre, password_hash) VALUES ('madrid_admin','financiero','fin@x.y','Fin Uno','x'), ('madrid_admin','financiero','fin2@x.y','Fin Dos','x')");
    const usuarios = await consultarDueno<{ id: number; nombre: string }>("SELECT id, nombre FROM cne.usuarios ORDER BY id");
    actor = { enlaceId: null, operadorId: null, operadorNombre: usuarios[0].nombre, usuarioId: usuarios[0].id };
    otro = { enlaceId: null, operadorId: null, operadorNombre: usuarios[1].nombre, usuarioId: usuarios[1].id };
    await consultarDueno("UPDATE cne.parametros_pago SET importe_usd=100, importe_eur=55, pagador_nombre='PAGADOR PRUEBA', pagador_cargo='CARGO PRUEBA', lugar='LUGAR PRUEBA'");
    for (const [cedula, junta] of [["0000000031", 12], ["0000000032", 13]] as const) {
      const [m] = await consultarDueno<{ id: number }>("INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id) SELECT $1,'APELLIDO PRUEBA','NOMBRE PRUEBA','VOCAL','vocal',id FROM cne.juntas_madrid WHERE serie='H' AND numero=$2 RETURNING id", [cedula, junta]);
      await guardarDocumento({ mjrvId: m.id, lado: "anverso", imagen: await foto(), origen: "estacion" });
      await guardarDocumento({ mjrvId: m.id, lado: "reverso", imagen: await foto(), origen: "estacion" });
    }
  });
  afterAll(closePools);

  it("empieza en impresión y un escaneo deja un icono por persona, visible para otro financiero", async () => {
    expect(await leerModoRecibo()).toBe("impresion");
    expect(await escanearParaRecibo(actor, "0000000031")).toMatchObject({ ok: true, modo: "impresion", junta: "M12" });
    expect(await escanearParaRecibo(otro, "0000000031")).toMatchObject({ ok: true, modo: "impresion", junta: "M12" });
    expect(await escanearParaRecibo(otro, "0000000032")).toMatchObject({ ok: true, modo: "impresion", junta: "M13" });
    const lista = await listarPendientes();
    expect(lista.map((p) => p.junta).sort()).toEqual(["M12", "M13"]);
    expect(await consultarDueno("SELECT 1 FROM cne.pagos_confirmados")).toHaveLength(0);
  });

  it("al pulsar el icono sale el acta y deja de estar pendiente, sin confirmar el pago", async () => {
    const [h12] = (await listarPendientes()).filter((p) => p.junta === "M12");
    const r = await imprimirPendiente(actor, h12.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Buffer.from(r.pdf).subarray(0, 4).toString()).toBe("%PDF");
    expect((await listarPendientes()).some((p) => p.junta === "M12")).toBe(false);
    expect(await consultarDueno("SELECT 1 FROM cne.pagos_confirmados")).toHaveLength(0);
  });

  it("en digital el escaneo no deja icono: guarda la firma y no confirma el pago", async () => {
    await fijarModoRecibo("digital");
    const antes = (await listarPendientes()).length;
    const e = await escanearParaRecibo(actor, "0000000032");
    expect(e).toMatchObject({ ok: true, modo: "digital", junta: "M13" });
    expect(await listarPendientes()).toHaveLength(antes);
    if (!e.ok || e.modo !== "digital") return;
    expect(await guardarFirma(actor, e.mjrvId, await firma())).toEqual({ ok: true });
    expect(await consultarDueno("SELECT 1 FROM cne.firmas_recibo")).toHaveLength(1);
    expect(await consultarDueno("SELECT 1 FROM cne.pagos_confirmados")).toHaveLength(0);
    await fijarModoRecibo("impresion");
  });
});