import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { closePools } from "@/server/db";
import { guardarDocumento } from "@/server/documentos";
import type { SesionEstacion } from "@/server/estaciones";
import { confirmarPago, generarActa } from "@/server/finanzas";
import { resumenFinanzas } from "@/server/finanzas-resumen";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const foto = () => sharp(randomBytes(900 * 600 * 3), { raw: { width: 900, height: 600, channels: 3 } }).jpeg({ quality: 70 }).toBuffer();
let s: SesionEstacion;
const ids: number[] = [];

describe("panel financiero", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.operadores_madrid (nombre, pin_hash, funciones) VALUES ('Fin Prueba','x','{finanzas}')");
    await consultarDueno("INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('finanzas','Finanzas 1','\\x01')");
    await consultarDueno("UPDATE cne.parametros_pago SET importe_usd=100, tipo_cambio=1, sentido_cambio='eur_por_usd', decimales_eur=2, redondeo='truncar', pagador_nombre='P', pagador_cargo='C', lugar='L'");
    const [o] = await consultarDueno<{ id: number }>("SELECT id FROM cne.operadores_madrid");
    const [e] = await consultarDueno<{ id: number }>("SELECT id FROM cne.enlaces_estacion");
    s = { sesionId: "x", funcion: "finanzas", operadorId: o.id, operadorNombre: "Fin Prueba", enlaceId: e.id, etiqueta: "F1" };
    for (const c of ["0000000001", "0000000002", "0000000003"]) {
      ids.push((await consultarDueno<{ id: number }>("INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id) SELECT $1,'APELLIDO PRUEBA ' || $1,'NOMBRE PRUEBA','VOCAL','vocal',id FROM cne.juntas_madrid WHERE serie='H' AND numero=1 RETURNING id", [c]))[0].id);
    }
    for (const id of ids.slice(0, 2)) {
      await guardarDocumento({ mjrvId: id, lado: "anverso", imagen: await foto(), origen: "estacion" });
      await guardarDocumento({ mjrvId: id, lado: "reverso", imagen: await foto(), origen: "estacion" });
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
    expect(r).toMatchObject({ pagados: 1, pendientes: 2, totalEur: "100.00", documentacionIncompleta: 1 });
    const pagada = r.filas.find((f) => f.estado === "pagada")!;
    expect(pagada).toMatchObject({ eur: "100.00", operador: "Fin Prueba", simulado: true, junta: "H1" });
  });

  it("el total suma solo confirmaciones", async () => {
    const [acta] = await consultarDueno<{ id: number }>("SELECT id FROM cne.actas_pago WHERE mjrv_id = $1", [ids[1]]);
    await confirmarPago(s, { mjrvId: ids[1], actaId: acta.id, verificado: true });
    expect((await resumenFinanzas()).totalEur).toBe("200.00");
    expect((await resumenFinanzas()).filas.map((f) => f.estado)).toEqual(["documentacion_incompleta", "pagada", "pagada"]);
  });
});
