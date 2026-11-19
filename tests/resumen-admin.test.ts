import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools } from "@/server/db";
import { resumenAdmin } from "@/server/resumen-admin";
import { consultarDueno, reiniciarBase } from "./helpers/db";

describe("inicio de administración", () => {
  beforeAll(async () => {
    await reiniciarBase();
    // Una junta completa necesita los tres cargos: presidente, secretario y vocal.
    for (const [c, rol] of [["0000000001", "presidente"], ["0000000002", "secretario"], ["0000000003", "vocal"]]) {
      await consultarDueno("INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id) SELECT $1,'APELLIDO PRUEBA','NOMBRE PRUEBA',upper($2),$2,id FROM cne.juntas_madrid WHERE serie='H' AND numero=1", [c, rol]);
    }
    await consultarDueno("UPDATE cne.mjrv SET credencial_generada_en = now() WHERE cedula = '0000000001'");
    await consultarDueno("INSERT INTO cne.operadores_madrid (nombre, pin_hash, funciones) VALUES ('Op Prueba','x','{puerta}')");
    await consultarDueno("INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('puerta','P1','\\x01')");
    for (const c of ["0000000001", "0000000002", "0000000003"]) {
      await consultarDueno("INSERT INTO cne.lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id) SELECT $1, m.id, 'valido', (SELECT id FROM cne.operadores_madrid), (SELECT id FROM cne.enlaces_estacion) FROM cne.mjrv m WHERE m.cedula = $1", [c]);
    }
    for (const lado of ["anverso", "reverso"]) {
      await consultarDueno("INSERT INTO cne.documentos_mjrv (mjrv_id, lado, imagen_cifrada, nonce, bytes, ancho, alto, sha256, origen) SELECT id, $1, '\\x00', '\\x00', 30000, 10, 10, decode(md5($1),'hex'), 'estacion' FROM cne.mjrv WHERE cedula = '0000000001'", [lado]);
    }
  });
  afterAll(closePools);

  it("separa apertura y pagos; los pagos no suben sin confirmación", async () => {
    const r = await resumenAdmin();
    expect(r.modoPrueba).toBe(true);
    expect(r.apertura).toMatchObject({ preparadas: 1, pendientes: 2, ingresados: 3, total: 3, completas: 1, incompletas: 0, sinNadie: 94 });
    expect(r.pagos).toEqual({ documentosCompletos: 1, documentosIncompletos: 2, pagados: 0, totalEur: "0" });
  });
});
