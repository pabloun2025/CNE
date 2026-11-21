import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { closePools } from "@/server/db";
import { guardarDocumento } from "@/server/documentos";
import { confirmarPago, fichaPago, generarActa, generarRecibosContingencia, type ActorPago } from "@/server/finanzas";
import { validarCedula } from "@/server/mjrv";
import { buscarRecibos, descargarRecibo } from "@/server/recibos";
import { consultarDueno, reiniciarBase } from "./helpers/db";

describe("secuencia de emisión de recibos", () => {
  let revision: ActorPago;
  let caja: ActorPago;
  let personas: number[];
  const buscar = (i: number) => String(i + 510).padStart(10, "0");
  const validar = (id: number) => validarCedula({ portal: "finanzas", tipo: "usuario", id: revision.usuarioId!, nombre: revision.operadorNombre }, id);
  async function adjuntarFotos(id: number) {
    for (const lado of ["anverso", "reverso"] as const) {
      const imagen = await sharp(randomBytes(600 * 400 * 3), { raw: { width: 600, height: 400, channels: 3 } }).jpeg().toBuffer();
      expect(await guardarDocumento({ mjrvId: id, lado, imagen, origen: "estacion" })).toMatchObject({ ok: true });
    }
  }

  beforeEach(async () => {
    await reiniciarBase();
    const usuarios = await consultarDueno<{ id: number; nombre: string }>(`INSERT INTO cne.usuarios (tipo, rol, correo, nombre, password_hash) VALUES
      ('madrid_admin','financiero','revision@example.invalid','Revisión Prueba','x'),
      ('madrid_admin','financiero','caja@example.invalid','Caja Prueba','x') RETURNING id, nombre`);
    [revision, caja] = usuarios.map((u) => ({ usuarioId: u.id, operadorNombre: u.nombre, enlaceId: null, operadorId: null }));
    await consultarDueno("UPDATE cne.parametros_pago SET importe_usd = 200, importe_eur = 90, pagador_nombre = 'PAGADOR PRUEBA'");
    personas = (await consultarDueno<{ id: number }>(`INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id)
      SELECT lpad(i::text,10,'0'),'APELLIDO PRUEBA','NOMBRE PRUEBA','VOCAL','vocal',j.id
        FROM cne.juntas_madrid j, generate_series(510, 518) i WHERE j.serie = 'H' AND j.numero = 1 ORDER BY i RETURNING id`)).map((x) => x.id);
  });
  afterEach(closePools);

  it("asigna el ordinal al emitir y conserva la emisión abandonada al reimprimir", async () => {
    expect(await fichaPago(buscar(1))).toMatchObject({ acta: null, importeEur: null, importeUsd: "70.00" });
    expect(await generarRecibosContingencia(revision, [personas[1]])).toMatchObject({ ok: true, numeros: ["PRUEBA-2026-001"] });
    expect(await generarRecibosContingencia(revision, [personas[0]])).toMatchObject({ ok: true, numeros: ["PRUEBA-2026-002"] });
    expect(await generarRecibosContingencia(caja, [personas[1]])).toMatchObject({ ok: true, numeros: ["PRUEBA-2026-001"] });
    expect(await fichaPago(buscar(1))).toMatchObject({
      importeEur: "58.82", importeUsd: "70.00", tipoCambio: "1.190", pago: null,
      acta: { ordinalRecibo: 1, impresionN: 2, numero: "PRUEBA-2026-001" },
    });
    expect(await buscarRecibos("PRUEBA-2026-001", 1)).toMatchObject({ total: 1, filas: [{ numero: "PRUEBA-2026-001", pagado: false }] });
    const acta = (await fichaPago(buscar(1)))!.acta!;
    expect(await descargarRecibo("acta", acta.id)).toMatchObject({ numero: "PRUEBA-2026-001" });
  });

  it("caja confirma con ambos lados y validación aunque revisión mantenga la ficha abierta", async () => {
    expect(await generarRecibosContingencia(revision, [personas[0]])).toMatchObject({ ok: true });
    const pagar = async () => {
      const f = (await fichaPago(buscar(0), caja))!;
      return confirmarPago(caja, { mjrvId: f.mjrvId, actaId: f.acta!.id, verificado: true });
    };
    await fichaPago(buscar(0), revision);
    expect(await pagar()).toMatchObject({ ok: false, mensaje: expect.stringContaining("Faltan fotos") });
    await adjuntarFotos(personas[0]);
    expect(await pagar()).toMatchObject({ ok: false, mensaje: expect.stringContaining("validar") });
    expect(await validar(personas[0])).toMatchObject({ ok: true });
    await consultarDueno("UPDATE cne.parametros_pago SET pagador_nombre = NULL, importe_eur = NULL, importe_usd = NULL");
    expect(await pagar()).toMatchObject({ ok: true, importeEur: "58.82", importeUsd: "70.00" });
    expect((await fichaPago(buscar(0)))?.pago?.operador).toBe("Caja Prueba");
    await consultarDueno("UPDATE cne.parametros_pago SET pagador_nombre = 'PAGADOR PRUEBA'");
  });

  it("un recibo definitivo histórico conserva sus importes y requiere validación para confirmar un pago nuevo", async () => {
    const [legado] = await consultarDueno<{ id: number }>(`INSERT INTO cne.actas_pago
      (mjrv_id, usuario_id, importe_eur, importe_usd, parametros, impresion_n)
      VALUES ($1,$2,54.17,66.21,'{}',1) RETURNING id`, [personas[0], revision.usuarioId]);
    await consultarDueno("UPDATE cne.parametros_pago SET pagador_nombre = NULL, importe_eur = NULL, importe_usd = NULL");
    await fichaPago(buscar(0), revision);
    await adjuntarFotos(personas[0]);
    const ficha = (await fichaPago(buscar(0), caja))!;
    expect(ficha).toMatchObject({ importeEur: "54.17", importeUsd: "66.21", acta: { id: legado.id, ordinalRecibo: null } });
    const confirmar = () => confirmarPago(caja, { mjrvId: ficha.mjrvId, actaId: legado.id, verificado: true });
    expect(await confirmar()).toMatchObject({ ok: false, mensaje: expect.stringContaining("validar") });
    expect(await validar(personas[0])).toMatchObject({ ok: true });
    expect(await confirmar()).toMatchObject({ ok: true, importeEur: "54.17", importeUsd: "66.21" });
    expect(await consultarDueno("SELECT ultimo_ordinal FROM cne.secuencia_recibos WHERE es_prueba")).toEqual([{ ultimo_ordinal: 0 }]);
  });

  it("aplica el cambio entre 190 y 191 bajo concurrencia, con cupo independiente por modo", async () => {
    await consultarDueno("UPDATE cne.secuencia_recibos SET ultimo_ordinal = 189 WHERE es_prueba");
    const resultados = await Promise.all(personas.slice(2, 4).map((id) => generarRecibosContingencia(revision, [id])));
    expect(resultados).toEqual(expect.arrayContaining([
      expect.objectContaining({ ok: true, numeros: ["PRUEBA-2026-190"] }),
      expect.objectContaining({ ok: true, numeros: ["PRUEBA-2026-191"] }),
    ]));
    expect(await consultarDueno(`SELECT ordinal_recibo AS ordinal, importe_eur::text AS eur, importe_usd::text AS usd, tipo_cambio::text AS cambio
      FROM cne.actas_pago WHERE ordinal_recibo >= 190 ORDER BY ordinal_recibo`)).toEqual([
      { ordinal: 190, eur: "58.82", usd: "70.00", cambio: "1.190000" },
      { ordinal: 191, eur: "58.83", usd: "70.00", cambio: "1.190000" },
    ]);
    await consultarDueno("UPDATE cne.configuracion SET modo = 'eleccion'");
    try {
      expect(await generarActa(caja, personas[3], true, { modoEsperado: "prueba" })).toMatchObject({ ok: false, status: 409 });
      expect(await generarRecibosContingencia(caja, [personas[3]], "prueba")).toMatchObject({ ok: false, status: 409 });
      expect(await generarRecibosContingencia(caja, [personas[3]])).toMatchObject({ ok: true, numeros: ["MAD-2026-001"] });
    } finally {
      await consultarDueno("UPDATE cne.configuracion SET modo = 'prueba'");
    }
  });

  it("al topar el cupo, revierte todo el lote y permite reimprimir el ordinal 285", async () => {
    await consultarDueno("UPDATE cne.secuencia_recibos SET ultimo_ordinal = 284 WHERE es_prueba");
    expect(await generarRecibosContingencia(revision, personas.slice(4, 6))).toMatchObject({ ok: false, status: 409 });
    expect(await consultarDueno("SELECT id FROM cne.actas_pago WHERE mjrv_id = ANY($1::bigint[])", [personas.slice(4, 6)])).toEqual([]);
    expect(await generarRecibosContingencia(revision, [personas[5]])).toMatchObject({ ok: true, numeros: ["PRUEBA-2026-285"] });
    expect(await generarRecibosContingencia(revision, [personas[4]])).toMatchObject({ ok: false, status: 409 });
    expect(await generarRecibosContingencia(revision, [personas[5]])).toMatchObject({ ok: true, numeros: ["PRUEBA-2026-285"] });
    expect(await fichaPago(buscar(5))).toMatchObject({ importeEur: "58.83", serieAgotada: true });
  });
});
