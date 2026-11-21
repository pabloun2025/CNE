import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { reiniciarOperativo, resumenReinicioTotal } from "@/server/reiniciar-operativo";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const superadmin: Sesion = {
  sesionId: "test", usuarioId: 1, correo: "super@prueba.cne", nombre: "Superadmin",
  tipo: "superadmin", rol: "consul", debeCambiar: false,
};
const cuentaAdmin: Sesion = { ...superadmin, tipo: "madrid_admin" };
const cantidad = async (tabla: string) => (
  await consultarDueno<{ n: number }>(`SELECT count(*)::int AS n FROM cne.${tabla}`)
)[0].n;

describe("reiniciar operativo completo, incluso ensayos realizados en modo elección", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno(
      "INSERT INTO cne.operadores_madrid (nombre, pin_hash, funciones) VALUES ('Operador de ensayo','hash-prueba','{puerta,finanzas}')",
    );
    await consultarDueno(
      "INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('puerta','Puerta prueba','\\x0102')",
    );
    await consultarDueno(`
      INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, es_prueba)
      SELECT '0000000001','FICTICIO','PRUEBA','VOCAL','vocal',id,true
      FROM cne.juntas_madrid WHERE serie='H' AND numero=1
    `);
    // También simula una persona importada en modo prueba: el importador real usa es_prueba=false.
    await consultarDueno(`
      INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, es_prueba)
      SELECT '0000000002','FICTICIO','EXCEL','VOCAL','vocal',id,false
      FROM cne.juntas_madrid WHERE serie='H' AND numero=2
    `);
    await consultarDueno(`
      INSERT INTO cne.envios_credencial (mjrv_id, canal, destino, simulado, estado)
      SELECT id,'correo','ensayo@ejemplo.invalid',true,'enviada_al_servicio'
      FROM cne.mjrv
    `);
    await consultarDueno(`
      INSERT INTO cne.credenciales_revocadas (mjrv_id, cedula, actor_nombre)
      SELECT id,cedula,'Operador de prueba' FROM cne.mjrv WHERE es_prueba
    `);

    for (const [modo, cedula] of [["prueba", "0000000001"], ["eleccion", "0000000002"]] as const) {
      await consultarDueno("UPDATE cne.configuracion SET modo=$1 WHERE id=1", [modo]);
      await consultarDueno(`
        INSERT INTO cne.actas_pago (mjrv_id, usuario_id, importe_eur, parametros, impresion_n, es_prueba)
        SELECT m.id,(SELECT id FROM cne.usuarios WHERE tipo='superadmin' LIMIT 1),58.82,'{}',1,$2
        FROM cne.mjrv m WHERE m.cedula=$1
      `, [cedula, modo === "prueba"]);
      await consultarDueno(`
        INSERT INTO cne.lecturas_puerta (codigo_leido, mjrv_id, resultado, enlace_id, es_prueba)
        SELECT m.cedula, m.id, 'valido', (SELECT id FROM cne.enlaces_estacion LIMIT 1), $2
        FROM cne.mjrv m WHERE m.cedula=$1
      `, [cedula, modo === "prueba"]);
      await consultarDueno("UPDATE cne.secuencia_recibos SET ultimo_ordinal=3 WHERE es_prueba=$1", [modo === "prueba"]);
    }
    await consultarDueno(
      "UPDATE cne.configuracion SET modo='eleccion', whatsapp_real=true, correo_real=true WHERE id=1",
    );
  });
  afterAll(closePools);

  it("solo permite superadministración y una confirmación textual exacta", async () => {
    await expect(reiniciarOperativo(cuentaAdmin, "BORRAR TODO")).rejects.toThrow("superadministración");
    expect(await reiniciarOperativo(superadmin, "borrar")).toMatchObject({ ok: false });
    expect(await cantidad("mjrv")).toBe(2);
    const resumen = await resumenReinicioTotal();
    expect(Object.fromEntries(resumen.map((x) => [x.tabla, x.n]))).toMatchObject({
      mjrv: 2, actas_pago: 2, lecturas_puerta: 2, envios_credencial: 2, credenciales_revocadas: 1,
    });
    expect((await consultarDueno<{ modo: string }>("SELECT modo FROM cne.configuracion"))[0].modo).toBe("eleccion");
  });

  it("elimina las fichas de ambos modos, sus recibos y los envíos, sin crear respaldo", async () => {
    const resultado = await reiniciarOperativo(superadmin, "BORRAR TODO");
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.antes.find((r) => r.tabla === "mjrv")?.n).toBe(2);
    expect(resultado.despues.every((r) => r.n === 0)).toBe(true);
    expect(await cantidad("mjrv")).toBe(0);
    expect(await cantidad("envios_credencial")).toBe(0);
    expect(await cantidad("credenciales_revocadas")).toBe(0);
    expect(await cantidad("juntas_madrid")).toBe(95);
    expect(await cantidad("usuarios")).toBeGreaterThan(0);
    expect(await cantidad("operadores_madrid")).toBe(1);
    expect(await cantidad("enlaces_estacion")).toBe(1);
    expect(await cantidad("respaldo_limpieza")).toBe(0);
    expect(await cantidad("auditoria")).toBeGreaterThan(0);
    expect(await consultarDueno("SELECT es_prueba, ultimo_ordinal FROM cne.secuencia_recibos ORDER BY es_prueba")).toEqual([
      { es_prueba: false, ultimo_ordinal: 0 },
    ]);
    const [cfg] = await consultarDueno<{ modo: string; whatsapp_real: boolean; correo_real: boolean }>(
      "SELECT modo, whatsapp_real, correo_real FROM cne.configuracion",
    );
    expect(cfg).toEqual({ modo: "eleccion", whatsapp_real: false, correo_real: false });
  });

  it("repetir el reinicio no borra la configuración", async () => {
    const resultado = await reiniciarOperativo(superadmin, "BORRAR TODO");
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.antes.every((r) => r.n === 0)).toBe(true);
    expect(await cantidad("juntas_madrid")).toBe(95);
    expect(await cantidad("operadores_madrid")).toBe(1);
  });
});
