import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST as impreso } from "@/app/api/admin/finanzas/impreso/route";
import { POST as confirmar } from "@/app/api/admin/finanzas/confirmar/route";
import { POST as escanear } from "@/app/api/e/finanzas/escanear/route";
import { GET as cola } from "@/app/api/admin/finanzas/escaneados/route";
import { POST as generar } from "@/app/api/admin/finanzas/acta/[mjrvId]/route";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { guardarDocumento } from "@/server/documentos";
import { closePools } from "@/server/db";
import { fichaPago } from "@/server/finanzas";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const actor = { usuarioId: 1, operadorId: null, enlaceId: null, operadorNombre: "Finanzas prueba" };
vi.mock("@/server/finanzas-cuenta", () => ({ cuentaFinanzas: async () => ({ ok: true, actor }) }));
vi.mock("@/server/estaciones", () => ({ accesoDirectoEstacion: async () => ({ ok: true, enlace: { id: 1 } }) }));

const solicitud = (cuerpo: Record<string, unknown>) => new Request("http://localhost", { method: "POST", body: JSON.stringify(cuerpo) });
const cedula = "0000000029";
const leerIngreso = () => escanear(solicitud({ cedula })).then((r) => r.json());
const obtenerCola = (etapa: string) => cola(new Request("http://localhost?etapa=" + etapa)).then((r) => r.json());
let mjrvId: number;
let actaId: number;

describe("circuito de Finanzas", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('finanzas','Ingreso de prueba',decode('01','hex'))");
    const [ficha] = await consultarDueno<{ id: number }>(
      `INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id)
        SELECT $1,'APELLIDO PRUEBA','NOMBRE PRUEBA','VOCAL','vocal',id FROM cne.juntas_madrid WHERE serie='H' AND numero=1 RETURNING id`, [cedula]);
    mjrvId = ficha.id;
    await consultarDueno("UPDATE cne.parametros_pago SET pagador_nombre='PAGADOR PRUEBA', pagador_cargo='CARGO PRUEBA'");
    await consultarDueno("INSERT INTO cne.usuarios (tipo,correo,nombre,password_hash,rol) VALUES ('madrid_admin','revision@prueba.cne','Revisión prueba','x','financiero')");
  });
  afterAll(closePools);

  it("dirige el primer ingreso y el repetido a Revisión sin duplicar la cola", async () => {
    for (const ingreso of await Promise.all([leerIngreso(), leerIngreso()])) {
      expect(ingreso).toEqual({ ok: true, etapa: "revision", nombre: "APELLIDO PRUEBA, NOMBRE PRUEBA" });
    }
    expect((await obtenerCola("revision")).escaneados).toHaveLength(1);
    expect((await obtenerCola("impresion")).escaneados).toHaveLength(0);
  });

  it("requiere la impresión declarada y vuelve a Impresión con el mismo número si cambian las fotos", async () => {
    for (const lado of ["anverso", "reverso"] as const) {
      const imagen = await sharp(randomBytes(900 * 600 * 3), { raw: { width: 900, height: 600, channels: 3 } }).jpeg({ quality: 70 }).toBuffer();
      expect(await guardarDocumento({ mjrvId, lado, imagen, origen: "estacion" })).toMatchObject({ ok: true });
    }
    const emitir = () => generar(solicitud({ verificado: true, modo: "prueba" }), { params: Promise.resolve({ mjrvId: String(mjrvId) }) });
    expect((await emitir()).status).toBe(409);
    await consultarDueno("INSERT INTO cne.cedulas_validadas (mjrv_id,validada_en) VALUES ($1,clock_timestamp())", [mjrvId]);
    expect(await leerIngreso()).toMatchObject({ etapa: "impresion" });
    // Dos impresoras no emiten a la vez la primera copia.
    await fichaPago(cedula, { ...actor, usuarioId: 2, operadorNombre: "Otra impresora prueba" });
    expect((await emitir()).status).toBe(409);
    await consultarDueno("DELETE FROM cne.fichas_abiertas_finanzas WHERE mjrv_id=$1", [mjrvId]);
    const pdf = await emitir();
    expect(pdf.status).toBe(200);
    actaId = Number(pdf.headers.get("x-acta-id"));
    expect(actaId).toBeGreaterThan(0);
    expect((await obtenerCola("caja")).escaneados).toHaveLength(0);
    const pagar = () => confirmar(solicitud({ mjrvId, actaId, verificado: true, modo: "prueba" })).then((r) => r.json());
    expect(await pagar()).toMatchObject({ ok: false });
    const sellar = (version: string | null, modo = "prueba") =>
      impreso(solicitud({ mjrvId, actaId, modo, version })).then((r) => r.json());
    const primeraVersion = pdf.headers.get("x-acta-version");
    expect((await impreso(solicitud({ mjrvId, actaId, modo: "prueba" }))).status).toBe(400);
    expect(await sellar(primeraVersion, "eleccion")).toMatchObject({ ok: false });
    expect(await sellar(primeraVersion)).toEqual({ ok: true });
    expect(await leerIngreso()).toMatchObject({ etapa: "caja" });

    await consultarDueno("UPDATE cne.documentos_mjrv SET creado_en=clock_timestamp() WHERE mjrv_id=$1 AND lado='anverso'", [mjrvId]);
    expect(await leerIngreso()).toMatchObject({ etapa: "revision" });
    await consultarDueno("UPDATE cne.cedulas_validadas SET validada_en=clock_timestamp() WHERE mjrv_id=$1", [mjrvId]);
    expect(await leerIngreso()).toMatchObject({ etapa: "impresion" });
    expect(await sellar(primeraVersion)).toMatchObject({ ok: false });
    expect(await pagar()).toMatchObject({ ok: false });
    const copia = await emitir();
    expect(copia.headers.get("x-acta-id")).toBe(String(actaId));
    expect(copia.headers.get("content-disposition")).toBe(pdf.headers.get("content-disposition"));
    expect(await sellar(primeraVersion)).toMatchObject({ ok: false });
    const versionVigente = copia.headers.get("x-acta-version");
    for (const sello of await Promise.all([sellar(versionVigente), sellar(versionVigente)])) {
      expect(sello).toEqual({ ok: true });
    }
    expect(await consultarDueno("SELECT 1 FROM cne.auditoria WHERE accion='recibo_impreso_para_caja'")).toHaveLength(2);
    expect((await obtenerCola("caja")).escaneados).toHaveLength(1);

    await consultarDueno(`INSERT INTO cne.asignaciones_cargo (mjrv_id,junta_id,cargo,origen,actor_tipo,actor_id,actor_nombre,verificada_en)
       SELECT id,junta_origen_id,'secretario','manual','madrid_admin',1,'ACTUACIÓN PRUEBA',clock_timestamp()
         FROM cne.mjrv WHERE id=$1`, [mjrvId]);
    expect(await leerIngreso()).toMatchObject({ etapa: "impresion" });
    expect(await pagar()).toMatchObject({ ok: false });
    const actualizada = await emitir();
    expect(actualizada.headers.get("x-acta-id")).toBe(String(actaId));
    expect(await sellar(versionVigente)).toMatchObject({ ok: false });
    expect(await sellar(actualizada.headers.get("x-acta-version"))).toEqual({ ok: true });

    const resultados = await Promise.all([pagar(), pagar()]);
    expect(resultados.filter((p) => p.ok)).toHaveLength(1);
    expect(await leerIngreso()).toMatchObject({ etapa: "pagada" });
  });
});
