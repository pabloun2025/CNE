import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { randomBytes } from "node:crypto";
import { closePools } from "@/server/db";
import { guardarDocumento } from "@/server/documentos";
import type { SesionEstacion } from "@/server/estaciones";
import { confirmarPago, fichaPago, generarActa } from "@/server/finanzas";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const foto = () => sharp(randomBytes(900 * 600 * 3), { raw: { width: 900, height: 600, channels: 3 } }).jpeg({ quality: 70 }).toBuffer();
let s: SesionEstacion;
let a: number, b: number; // dos personas
async function persona(cedula: string): Promise<number> {
  return (await consultarDueno<{ id: number }>("INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id) SELECT $1,'APELLIDO PRUEBA ' || $1,'NOMBRE PRUEBA','VOCAL','vocal',id FROM cne.juntas_madrid WHERE serie='H' AND numero=1 RETURNING id", [cedula]))[0].id;
}
async function conFotos(id: number) {
  await guardarDocumento({ mjrvId: id, lado: "anverso", imagen: await foto(), origen: "estacion" });
  await guardarDocumento({ mjrvId: id, lado: "reverso", imagen: await foto(), origen: "estacion" });
}
const completarParametros = () => consultarDueno("UPDATE cne.parametros_pago SET importe_eur=100, pagador_nombre='PAGADOR PRUEBA', pagador_cargo='CARGO PRUEBA', lugar='LUGAR PRUEBA'");
const vaciarParametros = () => consultarDueno("UPDATE cne.parametros_pago SET importe_eur=NULL, pagador_nombre=NULL, pagador_cargo=NULL, lugar=NULL");

describe("finanzas: acta y confirmación", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.operadores_madrid (nombre, pin_hash, funciones) VALUES ('Fin Prueba','x','{finanzas}')");
    await consultarDueno("INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('finanzas','Finanzas 1','\\x01')");
    const [o] = await consultarDueno<{ id: number }>("SELECT id FROM cne.operadores_madrid");
    const [e] = await consultarDueno<{ id: number }>("SELECT id FROM cne.enlaces_estacion");
    s = { sesionId: "x", funcion: "finanzas", operadorId: o.id, operadorNombre: "Fin Prueba", enlaceId: e.id, etiqueta: "F1" };
    a = await persona("0000000001");
    b = await persona("0000000002");
  });
  afterAll(closePools);

  it("sin fotos no hay acta y sin la casilla de verificación tampoco", async () => {
    expect(await generarActa(s, a, true)).toMatchObject({ ok: false, status: 409 });
    expect(await generarActa(s, a, false)).toMatchObject({ ok: false, status: 400 });
    expect((await fichaPago("0000000001"))?.estado).toBe("documentacion_incompleta");
    await conFotos(a);
    expect((await fichaPago("0000000001"))?.estado).toBe("lista");
  });

  it("sin parámetros solo sale el borrador, sin registro de acta, y no se puede confirmar", async () => {
    const r = await generarActa(s, a, true);
    expect(r).toMatchObject({ ok: true, borrador: true });
    expect((await consultarDueno("SELECT 1 FROM cne.actas_pago")).length).toBe(0);
    expect(await confirmarPago(s, { mjrvId: a, actaId: 1, verificado: true })).toMatchObject({ ok: false });
    expect((await fichaPago("0000000001"))?.parametrosCompletos).toBe(false);
  });

  it("con parámetros: acta de 2 páginas, reimpresión numerada y el estado NO pasa a pagado", async () => {
    await completarParametros();
    const r1 = await generarActa(s, a, true);
    expect(r1).toMatchObject({ ok: true, borrador: false });
    if (!r1.ok) return;
    expect(r1.numero).toMatch(/^PRUEBA-\d{6}$/);
    expect((await PDFDocument.load(r1.pdf)).getPageCount()).toBe(2);
    await generarActa(s, a, true);
    expect((await consultarDueno<{ impresion_n: number }>("SELECT impresion_n FROM cne.actas_pago ORDER BY id")).map((x) => x.impresion_n)).toEqual([1, 2]);
    const f = (await fichaPago("0000000001"))!;
    expect(f).toMatchObject({ estado: "acta_preparada", importeEur: "100.00", pago: null });
    expect((await consultarDueno("SELECT 1 FROM cne.pagos_confirmados")).length).toBe(0);
    // D03: importe fijo en EUR; USD y tipo de cambio ya no se rellenan.
    expect(await consultarDueno("SELECT importe_eur::text, importe_usd, tipo_cambio FROM cne.actas_pago WHERE mjrv_id = $1 LIMIT 1", [a])).toEqual([{ importe_eur: "100.00", importe_usd: null, tipo_cambio: null }]);
  });

  it("un acta ajena se rechaza", async () => {
    await conFotos(b);
    await generarActa(s, b, true);
    const [actaB] = await consultarDueno<{ id: number }>("SELECT id FROM cne.actas_pago WHERE mjrv_id = $1", [b]);
    expect(await confirmarPago(s, { mjrvId: a, actaId: actaB.id, verificado: true })).toMatchObject({ ok: false, mensaje: expect.stringContaining("no corresponde") });
  });

  it("dos puestos confirmando a la vez la misma persona: un solo pago, el otro ve «Ya pagado»", async () => {
    const [acta] = await consultarDueno<{ id: number }>("SELECT id FROM cne.actas_pago WHERE mjrv_id = $1 ORDER BY id DESC", [a]);
    const r = await Promise.all([confirmarPago(s, { mjrvId: a, actaId: acta.id, verificado: true }), confirmarPago(s, { mjrvId: a, actaId: acta.id, verificado: true }), confirmarPago(s, { mjrvId: a, actaId: acta.id, verificado: true })]);
    expect(r.filter((x) => x.ok)).toHaveLength(1);
    expect(r.find((x) => x.ok)).toMatchObject({ simulado: true, importeEur: "100.00" });
    expect(await consultarDueno("SELECT importe_usd, tipo_cambio FROM cne.pagos_confirmados WHERE mjrv_id = $1", [a])).toEqual([{ importe_usd: null, tipo_cambio: null }]);
    for (const x of r.filter((y) => !y.ok)) expect(x).toMatchObject({ ok: false, yaPagado: { importeEur: "100.00", operador: "Fin Prueba" } });
    expect((await consultarDueno("SELECT 1 FROM cne.pagos_confirmados")).length).toBe(1);
    expect((await fichaPago("0000000001"))).toMatchObject({ estado: "pagada", pago: { simulado: true } });
    expect(await generarActa(s, a, true)).toMatchObject({ ok: false, status: 409 });
  });

  it("parámetros incompletos o casilla sin marcar: confirmación rechazada", async () => {
    const [actaB] = await consultarDueno<{ id: number }>("SELECT id FROM cne.actas_pago WHERE mjrv_id = $1", [b]);
    expect(await confirmarPago(s, { mjrvId: b, actaId: actaB.id, verificado: false })).toMatchObject({ ok: false });
    await vaciarParametros();
    expect(await confirmarPago(s, { mjrvId: b, actaId: actaB.id, verificado: true })).toMatchObject({ ok: false });
    await completarParametros();
  });

  it("en modo elección el pago de prueba previo no bloquea el cobro real", async () => {
    await consultarDueno("UPDATE cne.configuracion SET modo = 'eleccion'");
    const f = (await fichaPago("0000000001"))!;
    expect(f).toMatchObject({ pago: null, acta: null, modoPrueba: false });
    // Las fotos de prueba tampoco cuentan en modo elección: hay que volver a fotografiar.
    expect(await generarActa(s, a, true)).toMatchObject({ ok: false, status: 409 });
    await conFotos(a);
    expect(await generarActa(s, a, true)).toMatchObject({ ok: true, borrador: false, numero: expect.stringMatching(/^MAD-\d{6}$/) });
    const [acta] = await consultarDueno<{ id: number }>("SELECT id FROM cne.actas_pago WHERE NOT es_prueba AND mjrv_id = $1", [a]);
    expect(await confirmarPago(s, { mjrvId: a, actaId: acta.id, verificado: true })).toMatchObject({ ok: true, simulado: false });
    expect((await consultarDueno("SELECT 1 FROM cne.pagos_confirmados")).length).toBe(2);
    await consultarDueno("UPDATE cne.configuracion SET modo = 'prueba'");
  });
});
