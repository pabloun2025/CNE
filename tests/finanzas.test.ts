import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { inflateSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import { closePools } from "@/server/db";
import { guardarDocumento } from "@/server/documentos";
import type { SesionEstacion } from "@/server/estaciones";
import { confirmarPago, fichaPago, generarActa } from "@/server/finanzas";
import { listarEscaneadosFinanzas, registrarEscaneoFinanzas } from "@/server/escaneos-finanzas";
import { resumenFinanzas } from "@/server/finanzas-resumen";
import { obtenerFicha, validarCedula } from "@/server/mjrv";
import { resumenAdmin } from "@/server/resumen-admin";
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
const completarParametros = () => consultarDueno("UPDATE cne.parametros_pago SET importe_usd=NULL, importe_eur=55, pagador_nombre='PAGADOR PRUEBA', pagador_cargo='CARGO PRUEBA', lugar='LUGAR PRUEBA'");
const validar = (id: number) => validarCedula({ portal: "finanzas", tipo: "operador", id: s.operadorId, nombre: s.operadorNombre }, id);

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

  it("emite el recibo oficial con fotos y asigna importe sin registrar el pago", async () => {
    await completarParametros();
    const r1 = await generarActa(s, a, true);
    expect(r1).toMatchObject({ ok: true, borrador: false });
    if (!r1.ok) return;
    expect(r1.numero).toBe("PRUEBA-2026-001");
    const doc = await PDFDocument.load(r1.pdf);
    expect(doc.getPageCount()).toBe(1);
    const buf = Buffer.from(r1.pdf);
    const trozos: Buffer[] = [];
    for (let i = 0; ; ) {
      const s = buf.indexOf("stream", i);
      if (s < 0) break;
      let a = s + 6;
      if (buf[a] === 13) a++;
      if (buf[a] === 10) a++;
      const e = buf.indexOf("endstream", a);
      if (e < 0) break;
      const fin = buf[e - 1] === 10 ? e - (buf[e - 2] === 13 ? 2 : 1) : e;
      try { trozos.push(inflateSync(buf.subarray(a, fin))); } catch { /* flujo ya plano */ }
      i = e + 9;
    }
    const plano = Buffer.concat(trozos).toString("latin1").replace(/<([0-9A-Fa-f\s]+)>/g, (_, h: string) => Buffer.from(h.replace(/\s/g, ""), "hex").toString("latin1"));
    expect(plano).toContain("FO-04(PE-PX-SU-02)");
    expect(plano).toContain("USD 70,00");
    expect(plano).toContain("EUR 58,82");
    expect(plano).toContain("1,190");
    expect(plano).toContain("ANVERSO");
    expect(await generarActa(s, a, true)).toMatchObject({ ok: true, numero: r1.numero, actaId: r1.actaId });
    expect((await consultarDueno<{ impresion_n: number }>("SELECT impresion_n FROM cne.actas_pago ORDER BY id")).map((x) => x.impresion_n)).toEqual([2]);
    const f = (await fichaPago("0000000001"))!;
    expect(f).toMatchObject({ estado: "acta_preparada", importeUsd: "70.00", importeEur: "58.82", pago: null });
    expect((await consultarDueno("SELECT 1 FROM cne.pagos_confirmados")).length).toBe(0);
    expect(await consultarDueno("SELECT importe_eur::text AS eur, importe_usd::text AS usd, tipo_cambio::text AS cambio FROM cne.actas_pago WHERE mjrv_id = $1 LIMIT 1", [a])).toEqual([{ eur: "58.82", usd: "70.00", cambio: "1.190000" }]);
  });

  it("un acta ajena se rechaza", async () => {
    await conFotos(b);
    await generarActa(s, b, true);
    const [actaB] = await consultarDueno<{ id: number }>("SELECT id FROM cne.actas_pago WHERE mjrv_id = $1", [b]);
    expect(await confirmarPago(s, { mjrvId: a, actaId: actaB.id, verificado: true })).toMatchObject({ ok: false, mensaje: expect.stringContaining("no corresponde") });
  });

  it("dos puestos confirmando a la vez la misma persona: un solo pago, el otro ve «Ya pagado»", async () => {
    expect(await validar(a)).toMatchObject({ ok: true });
    const [acta] = await consultarDueno<{ id: number }>("SELECT id FROM cne.actas_pago WHERE mjrv_id = $1 ORDER BY id DESC", [a]);
    const r = await Promise.all([confirmarPago(s, { mjrvId: a, actaId: acta.id, verificado: true }), confirmarPago(s, { mjrvId: a, actaId: acta.id, verificado: true }), confirmarPago(s, { mjrvId: a, actaId: acta.id, verificado: true })]);
    expect(r.filter((x) => x.ok)).toHaveLength(1);
    expect(r.find((x) => x.ok)).toMatchObject({ simulado: true, importeUsd: "70.00", importeEur: "58.82" });
    expect(await consultarDueno("SELECT importe_usd::text AS usd, importe_eur::text AS eur, tipo_cambio::text AS cambio FROM cne.pagos_confirmados WHERE mjrv_id = $1", [a])).toEqual([{ usd: "70.00", eur: "58.82", cambio: "1.190000" }]);
    for (const x of r.filter((y) => !y.ok)) expect(x).toMatchObject({ ok: false, yaPagado: { importeUsd: "70.00", importeEur: "58.82", operador: "Fin Prueba" } });
    expect((await consultarDueno("SELECT 1 FROM cne.pagos_confirmados")).length).toBe(1);
    expect((await fichaPago("0000000001"))).toMatchObject({ estado: "pagada", pago: { simulado: true } });
    expect(await generarActa(s, a, true)).toMatchObject({ ok: false, status: 409 });
  });

  it("casilla sin marcar o cédula sin validar: confirmación rechazada", async () => {
    const [actaB] = await consultarDueno<{ id: number }>("SELECT id FROM cne.actas_pago WHERE mjrv_id = $1", [b]);
    expect(await confirmarPago(s, { mjrvId: b, actaId: actaB.id, verificado: false })).toMatchObject({ ok: false });
    expect(await confirmarPago(s, { mjrvId: b, actaId: actaB.id, verificado: true })).toMatchObject({ ok: false, mensaje: expect.stringContaining("validar") });
  });

  it("en modo elección el pago de prueba previo no bloquea el cobro real", async () => {
    await consultarDueno("UPDATE cne.configuracion SET modo = 'eleccion'");
    const f = (await fichaPago("0000000001"))!;
    expect(f).toMatchObject({ pago: null, acta: null, modoPrueba: false });
    // Las fotos de prueba tampoco cuentan en modo elección: hay que volver a fotografiar.
    expect(await generarActa(s, a, true)).toMatchObject({ ok: false, status: 409 });
    await conFotos(a);
    expect(await generarActa(s, a, true)).toMatchObject({ ok: true, borrador: false, numero: "MAD-2026-001" });
    expect(await validar(a)).toMatchObject({ ok: true });
    const [acta] = await consultarDueno<{ id: number }>("SELECT id FROM cne.actas_pago WHERE NOT es_prueba AND mjrv_id = $1", [a]);
    expect(await confirmarPago(s, { mjrvId: a, actaId: acta.id, verificado: true })).toMatchObject({ ok: true, simulado: false });
    expect((await consultarDueno("SELECT 1 FROM cne.pagos_confirmados")).length).toBe(2);
    await consultarDueno("UPDATE cne.configuracion SET modo = 'prueba'");
  });
  it("avisa de otra apertura y aplica el bloqueo de la primera emisión", async () => {
    await consultarDueno("INSERT INTO cne.operadores_madrid (nombre, pin_hash, funciones) VALUES ('Ana Prueba','x','{finanzas}')");
    await consultarDueno("INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('finanzas','Finanzas 2','\\x02')");
    const [o2] = await consultarDueno<{ id: number }>("SELECT id FROM cne.operadores_madrid WHERE nombre = 'Ana Prueba'");
    const [e2] = await consultarDueno<{ id: number }>("SELECT id FROM cne.enlaces_estacion WHERE etiqueta = 'Finanzas 2'");
    const s2: SesionEstacion = { sesionId: "y", funcion: "finanzas", operadorId: o2.id, operadorNombre: "Ana Prueba", enlaceId: e2.id, etiqueta: "Finanzas 2" };
    await consultarDueno("DELETE FROM cne.fichas_abiertas_finanzas");
    // El primer puesto abre la ficha: no ve a nadie más (ni a sí mismo).
    expect((await fichaPago("0000000002", s))?.otrosPuestos).toEqual([]);
    // El segundo la abre: ve al primero con etiqueta y operador.
    const f2 = await fichaPago("0000000002", s2);
    expect(f2?.otrosPuestos).toEqual([{ etiqueta: "Finanzas 1", operador: "Fin Prueba", haceMin: 0 }]);
    // Sin sesión (consulta interna) no anota ni avisa.
    expect((await fichaPago("0000000002"))?.otrosPuestos).toEqual([]);
    // Pasados 5 minutos ya no aparece; reabrir la ficha renueva la anotación.
    await consultarDueno("UPDATE cne.fichas_abiertas_finanzas SET abierta_en = now() - interval '6 minutes' WHERE enlace_id = $1", [s.enlaceId]);
    expect((await fichaPago("0000000002", s2))?.otrosPuestos).toEqual([]);
    await consultarDueno("UPDATE cne.fichas_abiertas_finanzas SET abierta_en = now() - interval '2 minutes' WHERE enlace_id = $1", [s.enlaceId]);
    expect((await fichaPago("0000000002", s2))?.otrosPuestos).toMatchObject([{ operador: "Fin Prueba", haceMin: 2 }]);
    await completarParametros();
    await conFotos(b);
    const c = await persona("0000000003");
    await conFotos(c);
    await fichaPago("0000000003", s);
    await fichaPago("0000000003", s2);
    // s abrió antes: puede. s2 llegó después: no puede.
    expect(await generarActa(s2, c, true)).toMatchObject({ ok: false, status: 409, mensaje: expect.stringContaining("Otra persona") });
    expect(await consultarDueno("SELECT 1 FROM cne.actas_pago WHERE mjrv_id = $1", [c])).toEqual([]);
    const emitida = await generarActa(s, c, true);
    expect(emitida).toMatchObject({ ok: true });
    if (!emitida.ok) throw new Error("Falta el recibo definitivo");
    expect(await generarActa(s2, c, true)).toMatchObject({ ok: true, numero: emitida.numero });
  });

  it("revalida un pasaporte fotografiado después de una cédula y habilita su cobro", async () => {
    const cedula = "0000000004";
    const mjrvId = await persona(cedula);
    await completarParametros();
    await conFotos(mjrvId);
    expect(await validar(mjrvId)).toMatchObject({ ok: true });
    const antes = await resumenAdmin();
    expect(await guardarDocumento({ mjrvId, lado: "pasaporte", numeroPasaporte: "PRUEBA123", imagen: await foto(), origen: "estacion" }))
      .toMatchObject({ ok: true });

    expect(await registrarEscaneoFinanzas(s.enlaceId, cedula)).toBe(true);
    expect(await registrarEscaneoFinanzas(s.enlaceId, "PRUEBA123")).toBe(false);
    expect(await fichaPago(cedula)).toMatchObject({ cedula, pasaporte: true, numeroPasaporte: "PRUEBA123", documentosCompletos: true, cedulaValidada: false });
    expect(await obtenerFicha(mjrvId)).toMatchObject({ cedula, pasaporte: true, numeroPasaporte: "PRUEBA123", completos: true });
    expect((await resumenAdmin()).pagos.documentosCompletos).toBe(antes.pagos.documentosCompletos);
    expect((await resumenFinanzas()).filas.find((f) => f.id === mjrvId)).toMatchObject({ cedula, fotosCompletas: true, cedulaValidada: false });

    const acta = await generarActa(s, mjrvId, true);
    if (!acta.ok || acta.actaId === null) throw new Error("Falta el recibo definitivo con pasaporte");
    expect((await listarEscaneadosFinanzas(true)).escaneados.some((f) => f.mjrvId === mjrvId)).toBe(false);
    expect(await confirmarPago(s, { mjrvId, actaId: acta.actaId, verificado: true })).toMatchObject({ ok: false, mensaje: expect.stringContaining("validar") });
    expect(await validar(mjrvId)).toMatchObject({ ok: true });
    expect((await listarEscaneadosFinanzas(true)).escaneados).toContainEqual(expect.objectContaining({ mjrvId, cedula, documentado: true }));
    expect(await confirmarPago(s, { mjrvId, actaId: acta.actaId, verificado: true })).toMatchObject({ ok: true, importeEur: "58.82" });
  });

  it("Caja exige reimprimir un recibo pendiente si se reemplaza el documento por un pasaporte", async () => {
    const cedula = "0000000005";
    const mjrvId = await persona(cedula);
    await completarParametros();
    await conFotos(mjrvId);
    expect(await validar(mjrvId)).toMatchObject({ ok: true });
    const original = await generarActa(s, mjrvId, true);
    if (!original.ok || original.actaId === null) throw new Error("Falta el recibo original");
    const [{ creado_en, ordinal_recibo }] = await consultarDueno<{ creado_en: Date; ordinal_recibo: number }>(
      "SELECT creado_en, ordinal_recibo FROM cne.actas_pago WHERE id = $1", [original.actaId]);
    expect(await guardarDocumento({ mjrvId, lado: "pasaporte", numeroPasaporte: "PRUEBA789", imagen: await foto(), origen: "estacion" })).toMatchObject({ ok: true });
    expect(await validar(mjrvId)).toMatchObject({ ok: true });
    expect(await fichaPago(cedula)).toMatchObject({ acta: { id: original.actaId, documentoPendiente: true } });
    expect((await listarEscaneadosFinanzas(true)).escaneados.some((f) => f.mjrvId === mjrvId)).toBe(false);
    expect(await confirmarPago(s, { mjrvId, actaId: original.actaId, verificado: true })).toMatchObject({ ok: false, mensaje: expect.stringContaining("Reimprima") });

    const reimpresion = await generarActa(s, mjrvId, true);
    expect(reimpresion).toMatchObject({ ok: true, numero: original.numero, actaId: original.actaId });
    expect(await consultarDueno(`SELECT creado_en, ordinal_recibo, importe_eur::text AS importe, parametros->'persona_recibo' AS persona
      FROM cne.actas_pago WHERE mjrv_id = $1`, [mjrvId])).toEqual([expect.objectContaining({ creado_en, ordinal_recibo, importe: "58.82",
        persona: expect.objectContaining({ cedula: "PRUEBA789", tipoDocumento: "pasaporte", apellidos: `APELLIDO PRUEBA ${cedula}` }) })]);
    expect((await fichaPago(cedula))?.acta?.documentoPendiente).toBeUndefined();
    expect((await listarEscaneadosFinanzas(true)).escaneados).toContainEqual(expect.objectContaining({ mjrvId, documentado: true }));
    expect(await confirmarPago(s, { mjrvId, actaId: original.actaId, verificado: true })).toMatchObject({ ok: true, importeEur: "58.82" });
  });
});
