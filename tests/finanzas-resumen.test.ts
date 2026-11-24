import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { closePools } from "@/server/db";
import { guardarDocumento } from "@/server/documentos";
import type { SesionEstacion } from "@/server/estaciones";
import { confirmarPago, generarActa } from "@/server/finanzas";
import { resumenFinanzas } from "@/server/finanzas-resumen";
import { resumenAdmin } from "@/server/resumen-admin";
import { corregirNombres, validarCedula } from "@/server/mjrv";
import * as XLSX from "xlsx";
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from "pdf-lib";
import { informeCierreExcel } from "@/server/informe-excel";
import { informeCierrePdf } from "@/server/pdf/informe";
import { GET as descargarInforme } from "@/app/admin/(panel)/informes/descargar/route";
import { login } from "@/server/auth";
import { consultarDueno, reiniciarBase } from "./helpers/db";

let tokenAdmin: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (nombre: string) => nombre === "cne_admin" ? { value: tokenAdmin } : undefined }),
}));

const foto = () => sharp(randomBytes(900 * 600 * 3), { raw: { width: 900, height: 600, channels: 3 } }).jpeg({ quality: 70 }).toBuffer();
let s: SesionEstacion;
const ids: number[] = [];

describe("panel financiero", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.operadores_madrid (nombre, pin_hash, funciones) VALUES ('Fin Prueba','x','{finanzas}')");
    await consultarDueno("INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('finanzas','Finanzas 1','\\x01')");
    await consultarDueno("UPDATE cne.parametros_pago SET importe_usd=100, importe_eur=55, pagador_nombre='P', pagador_cargo='C', lugar='L'");
    const [o] = await consultarDueno<{ id: number }>("SELECT id FROM cne.operadores_madrid");
    const [e] = await consultarDueno<{ id: number }>("SELECT id FROM cne.enlaces_estacion");
    s = { sesionId: "x", funcion: "finanzas", operadorId: o.id, operadorNombre: "Fin Prueba", enlaceId: e.id, etiqueta: "F1" };
    for (const c of ["0000000001", "0000000002", "0000000003"]) {
      ids.push((await consultarDueno<{ id: number }>("INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id) SELECT $1,'APELLIDO PRUEBA ' || $1,'NOMBRE PRUEBA','VOCAL','vocal',id FROM cne.juntas_madrid WHERE serie='H' AND numero=1 RETURNING id", [c]))[0].id);
    }
    for (const id of ids.slice(0, 2)) {
      await guardarDocumento({ mjrvId: id, lado: "anverso", imagen: await foto(), origen: "estacion" });
      await guardarDocumento({ mjrvId: id, lado: "reverso", imagen: await foto(), origen: "estacion" });
      await validarCedula({ portal: "finanzas", tipo: "operador", id: s.operadorId, nombre: s.operadorNombre }, id);
    }
  });
  afterAll(closePools);

  it("generar actas no cambia «pagados» ni el total; confirmar sí", async () => {
    let r = await resumenFinanzas();
    expect(r).toMatchObject({ pagados: 0, pendientes: 3, documentacionIncompleta: 1, totalEur: "0", modoPrueba: true });
    await generarActa(s, ids[0], true);
    await generarActa(s, ids[1], true);
    r = await resumenFinanzas();
    expect(r).toMatchObject({ pagados: 0, pendientes: 3, totalEur: "0" });
    expect(r.filas.filter((f) => f.estado === "acta_preparada")).toHaveLength(2);
    const [acta] = await consultarDueno<{ id: number }>("SELECT id FROM cne.actas_pago WHERE mjrv_id = $1", [ids[0]]);
    await confirmarPago(s, { mjrvId: ids[0], actaId: acta.id, verificado: true });
    r = await resumenFinanzas();
    expect(r).toMatchObject({ pagados: 1, pendientes: 2, totalEur: "58.82", documentacionIncompleta: 1 });
    const pagada = r.filas.find((f) => f.estado === "pagada")!;
    expect(pagada).toMatchObject({ eur: "58.82", operador: "Fin Prueba", simulado: true, junta: "M1" });
  });

  it("el total suma solo confirmaciones", async () => {
    const [acta] = await consultarDueno<{ id: number }>("SELECT id FROM cne.actas_pago WHERE mjrv_id = $1", [ids[1]]);
    await confirmarPago(s, { mjrvId: ids[1], actaId: acta.id, verificado: true });
    expect((await resumenFinanzas()).totalEur).toBe("117.64");
    expect((await resumenAdmin()).pagos.totalEur).toBe("117.64");
    expect((await resumenFinanzas()).filas.map((f) => f.estado)).toEqual(["documentacion_incompleta", "pagada", "pagada"]);
  });

  it("informe de cierre: PDF y Excel con las mismas filas, total solo de confirmados y sin fotos", async () => {
    const r = await resumenFinanzas();
    const datos = { generadoEn: r.generado_en, modoPrueba: r.modoPrueba, totalEur: r.totalEur, filas: r.filas };
    const pdf = Buffer.from(await informeCierrePdf(datos));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const xlsx = informeCierreExcel(datos);
    const hoja = XLSX.read(xlsx, { type: "buffer" }).Sheets["Informe"];
    const filas = XLSX.utils.sheet_to_json<(string | number)[]>(hoja, { header: 1, blankrows: false });
    const cabecera = filas.findIndex((f) => f[0] === "Cédula");
    const datosFilas = filas.slice(cabecera + 1, cabecera + 1 + 3);
    expect(filas[cabecera]).toEqual(["Cédula", "Persona", "Junta", "Condición", "EUR", "Momento (Madrid)", "Operador pagador"]);
    expect(datosFilas.map((f) => f[0]).sort()).toEqual(["0000000001", "0000000002", "0000000003"]); // cédula como texto
    expect(datosFilas.every((f) => typeof f[0] === "string" && String(f[0]).startsWith("0000"))).toBe(true);
    expect(datosFilas.filter((f) => String(f[3]) === "Pagada")).toHaveLength(2);
    expect(filas.find((f) => String(f[0]).startsWith("TOTAL ENTREGADO EUR"))?.[1]).toBe(117.64);
    expect(filas.some((f) => String(f[0]).includes("PRUEBA"))).toBe(true); // marca de informe de prueba
  });

  it("la descarga de Finanzas aplica las columnas elegidas en PDF y Excel", async () => {
    await consultarDueno(`INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash, debe_cambiar, rol)
      SELECT 'madrid_admin', 'fin@prueba.cne', 'Financiero Prueba', password_hash, false, 'financiero'
        FROM cne.usuarios WHERE tipo = 'superadmin'`);
    const sesion = await login({ correo: "fin@prueba.cne", password: "clave-de-prueba-1", portal: "admin", ip: null, agente: "prueba" });
    if (!sesion.ok) throw new Error("No se pudo iniciar la sesión de prueba");
    tokenAdmin = sesion.token;
    const descargar = (params: string) => descargarInforme(new Request(`http://localhost/admin/informes/descargar?${params}`));
    try {
      const excel = await descargar("formato=xlsx&seleccion=1&columnas=junta&columnas=eur");
      expect(excel.status).toBe(200);
      const hoja = XLSX.read(new Uint8Array(await excel.arrayBuffer())).Sheets.Informe;
      const filas = XLSX.utils.sheet_to_json<(string | number)[]>(hoja, { header: 1, blankrows: false });
      expect(filas).toContainEqual(["Junta", "EUR"]);
      expect(filas).toContainEqual(["M1", 58.82]);
      expect(filas).toContainEqual(["TOTAL ENTREGADO EUR (solo pagos confirmados)", 117.64]);
      expect(filas.flat()).not.toContain("Cédula");

      const pdf = await descargar("formato=pdf&seleccion=1&columnas=junta");
      expect(pdf.status).toBe(200);
      expect(pdf.headers.get("content-type")).toBe("application/pdf");
      expect(pdf.headers.get("cache-control")).toBe("no-store");
      const documento = await PDFDocument.load(await pdf.arrayBuffer());
      const contenido = documento.getPages().flatMap((pagina) => {
        const contenidoPagina = pagina.node.Contents();
        return contenidoPagina instanceof PDFArray ? contenidoPagina.asArray() : [contenidoPagina];
      }).map((ref) => {
        const stream = documento.context.lookup(ref);
        if (!(stream instanceof PDFRawStream)) throw new Error("Falta el contenido de la página");
        return Buffer.from(decodePDFRawStream(stream).decode()).toString();
      }).join("\n");
      expect(contenido).toContain(Buffer.from("Junta").toString("hex").toUpperCase());
      expect(contenido).not.toContain(Buffer.from("0000000001").toString("hex").toUpperCase());
      expect((await descargar("formato=xlsx&columnas=foto")).status).toBe(400);
    } finally {
      tokenAdmin = undefined;
    }
    expect((await descargar("formato=xlsx")).status).toBe(401);
  });

  it("distingue los pagos legados sin importe EUR del total conocido", async () => {
    await consultarDueno("UPDATE cne.pagos_confirmados SET importe_eur = NULL WHERE mjrv_id = $1", [ids[0]]);
    try {
      const r = await resumenFinanzas();
      expect(r).toMatchObject({ totalEur: "58.82", pagosSinImporteEur: 1, pagados: 2 });
      expect((await resumenAdmin()).pagos).toMatchObject({ totalEur: "58.82", pagosSinImporteEur: 1 });
      const datos = { generadoEn: r.generado_en, modoPrueba: r.modoPrueba, totalEur: r.totalEur, filas: r.filas };
      const hoja = XLSX.read(informeCierreExcel(datos), { type: "buffer" }).Sheets["Informe"];
      expect(XLSX.utils.sheet_to_json(hoja, { header: 1 })).toContainEqual(["Pagos confirmados sin importe EUR", 1]);
    } finally {
      await consultarDueno("UPDATE cne.pagos_confirmados SET importe_eur = 58.82 WHERE mjrv_id = $1", [ids[0]]);
    }
  });

  it("el financiero corrige el nombre y ve quién no tiene la cédula validada", async () => {
    const actor = { tipo: "usuario" as const, id: 1, nombre: "Fin", portal: "admin" as const };
    expect((await resumenFinanzas()).sinCedulaValidada).toBe(1);
    expect((await validarCedula(actor, ids[2])).ok).toBe(false);
    expect((await validarCedula(actor, ids[0])).ok).toBe(true);
    expect((await corregirNombres(actor, ids[2], "APELLIDO CORREGIDO", "NOMBRE CORREGIDO")).ok).toBe(true);
    expect((await corregirNombres(actor, ids[2], "A", "NOMBRE CORREGIDO")).ok).toBe(false);
    const r = await resumenFinanzas();
    expect(r.sinCedulaValidada).toBe(1);
    expect(r.filas.find((f) => f.id === ids[0])).toMatchObject({ cedulaValidada: true, fotosCompletas: true });
    expect(r.filas.find((f) => f.id === ids[2])).toMatchObject({ apellidos: "APELLIDO CORREGIDO", nombres: "NOMBRE CORREGIDO", cedula: "0000000003", cedulaValidada: false, fotosCompletas: false });
  });

  it("el informe conserva la fecha de validación de la ficha al borrar las fotos", async () => {
    const antes = (await resumenFinanzas()).filas.find((f) => f.id === ids[0]);
    expect(antes?.validacionEn).toBeTruthy();
    await consultarDueno("DELETE FROM cne.documentos_mjrv WHERE mjrv_id = $1", [ids[0]]);
    const ficha = (await resumenFinanzas()).filas.find((f) => f.id === ids[0]);
    expect(ficha).toMatchObject({ cedulaValidada: true, fotosCompletas: false, validacionEn: antes?.validacionEn });
  });

  it("el corte usa los registros de ingreso y pago del modo actual", async () => {
    const fichaId = ids[2];
    await guardarDocumento({ mjrvId: fichaId, lado: "anverso", imagen: await foto(), origen: "estacion" });
    await guardarDocumento({ mjrvId: fichaId, lado: "reverso", imagen: await foto(), origen: "estacion" });
    const actor = { tipo: "usuario" as const, id: 1, nombre: "Fin", portal: "admin" as const };
    expect((await validarCedula(actor, fichaId)).ok).toBe(true);
    await generarActa(s, fichaId, true);
    const [acta] = await consultarDueno<{ id: number }>("SELECT id FROM cne.actas_pago WHERE mjrv_id = $1", [fichaId]);
    await confirmarPago(s, { mjrvId: fichaId, actaId: acta.id, verificado: true });
    await consultarDueno("INSERT INTO cne.operadores_madrid (nombre, apellido, pin_hash, funciones) VALUES ('Puerta','Prueba','x','{puerta}')");
    await consultarDueno("INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('puerta','Puerta prueba','\\x02')");
    await consultarDueno(`INSERT INTO cne.lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id, creado_en)
      SELECT 'PRUEBA', $1, 'valido', o.id, e.id, '2026-11-29 07:05:00+00'
        FROM cne.operadores_madrid o CROSS JOIN cne.enlaces_estacion e
       WHERE o.nombre = 'Puerta' AND e.funcion = 'puerta'`, [fichaId]);
    await consultarDueno(`INSERT INTO cne.decisiones_movimiento (mjrv_id, junta_origen_id, junta_destino_id, decision, actor_tipo, actor_id, actor_nombre)
      SELECT m.id, m.junta_origen_id, j.id, 'aceptada', 'madrid_admin', 1, 'Operador prueba'
        FROM cne.mjrv m CROSS JOIN cne.juntas_madrid j WHERE m.id = $1 AND j.serie = 'H' AND j.numero = 25`, [fichaId]);
    const prueba = await resumenFinanzas();
    expect(prueba.modoPrueba).toBe(true);
    const fichaPrueba = prueba.filas.find((f) => f.id === fichaId);
    expect(fichaPrueba).toMatchObject({ junta: "M25", zona: "azul", cargo: "VOCAL", operadorIngreso: "Puerta Prueba", operador: "Fin Prueba", eur: "58.82" });
    expect(new Date(fichaPrueba?.ingresoEn ?? "").toISOString()).toBe("2026-11-29T07:05:00.000Z");
    expect(fichaPrueba?.validacionEn).toBeTruthy();
    await consultarDueno("UPDATE cne.configuracion SET modo = 'eleccion'");
    try {
      const eleccion = await resumenFinanzas();
      expect(eleccion).toMatchObject({ modoPrueba: false, totalEur: "0", pagados: 0 });
      expect(eleccion.filas.find((f) => f.id === fichaId)).toMatchObject({ junta: "M1", zona: "amarillo", ingresoEn: null, operadorIngreso: null, eur: null });
    } finally {
      await consultarDueno("UPDATE cne.configuracion SET modo = 'prueba'");
    }
  });

  it("un reemplazo de la foto requiere una nueva validación", async () => {
    const fichaId = ids[1];
    const actor = { tipo: "usuario" as const, id: 1, nombre: "Fin", portal: "admin" as const };
    expect(await validarCedula(actor, fichaId)).toMatchObject({ ok: true });
    expect(await guardarDocumento({ mjrvId: fichaId, lado: "anverso", imagen: await foto(), origen: "estacion" })).toMatchObject({ ok: true });
    const ficha = (await resumenFinanzas()).filas.find((f) => f.id === fichaId);
    expect(ficha).toMatchObject({ cedulaValidada: false, fotosCompletas: true, validacionEn: null });
    expect(await validarCedula(actor, fichaId)).toMatchObject({ ok: true });
    expect((await resumenFinanzas()).filas.find((f) => f.id === fichaId)).toMatchObject({ cedulaValidada: true, fotosCompletas: true });
  });

  it("una validación de prueba no cubre las fotos del modo elección", async () => {
    const fichaId = ids[1];
    const actor = { tipo: "usuario" as const, id: 1, nombre: "Fin", portal: "admin" as const };
    expect(await validarCedula(actor, fichaId)).toMatchObject({ ok: true });
    await consultarDueno("UPDATE cne.configuracion SET modo = 'eleccion'");
    try {
      for (const lado of ["anverso", "reverso"] as const) {
        expect(await guardarDocumento({ mjrvId: fichaId, lado, imagen: await foto(), origen: "estacion" })).toMatchObject({ ok: true });
      }
      const ficha = (await resumenFinanzas()).filas.find((f) => f.id === fichaId);
      expect(ficha).toMatchObject({ cedulaValidada: false, fotosCompletas: true, validacionEn: null });
    } finally {
      await consultarDueno("UPDATE cne.configuracion SET modo = 'prueba'");
    }
    expect((await resumenFinanzas()).filas.find((f) => f.id === fichaId)).toMatchObject({ cedulaValidada: true });
  });
});
