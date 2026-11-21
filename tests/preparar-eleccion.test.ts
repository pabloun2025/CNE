import { existsSync, rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { cargarDemo } from "@/server/demo";
import { prepararEleccion, resumenLimpieza } from "@/server/preparar-eleccion";
import { crearRespaldo, rutaRespaldo } from "@/server/respaldo";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const sesion = (tipo = "superadmin"): Sesion => ({ sesionId: "x", usuarioId: 1, correo: "s@x.y", nombre: "S", tipo, rol: "consul", debeCambiar: false });
const n = async (sql: string) => (await consultarDueno<{ n: number }>(`SELECT count(*)::int AS n FROM ${sql}`))[0].n;

async function sembrarActividad() {
  // Real (es_prueba = false) y de prueba, más operador y enlace que deben sobrevivir.
  await consultarDueno("INSERT INTO cne.operadores_madrid (nombre, pin_hash, funciones) VALUES ('Operador Prueba','x','{puerta,finanzas}') ON CONFLICT DO NOTHING");
  await consultarDueno("INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('puerta','Puerta 1','\\x0102') ON CONFLICT DO NOTHING");
  await consultarDueno("INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id) SELECT '9999999999','REAL FICTICIO','X','VOCAL','vocal',id FROM cne.juntas_madrid WHERE serie='H' AND numero=1 ON CONFLICT DO NOTHING");
  const demo = "(SELECT id FROM cne.mjrv WHERE es_prueba LIMIT 1)";
  const oper = "(SELECT id FROM cne.operadores_madrid LIMIT 1)";
  const enl = "(SELECT id FROM cne.enlaces_estacion LIMIT 1)";
  await consultarDueno(`INSERT INTO cne.lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id, es_prueba) VALUES ('0000000001', ${demo}, 'valido', ${oper}, ${enl}, true)`);
  await consultarDueno(`INSERT INTO cne.excepciones_disponibilidad (mjrv_id, motivo, actor_tipo, actor_id, actor_nombre, es_prueba) VALUES (${demo}, 'ensayo', 'madrid_admin', 1, 'A', true)`);
  await consultarDueno(`INSERT INTO cne.actas_pago (mjrv_id, operador_id, importe_usd, tipo_cambio, importe_eur, parametros, impresion_n, es_prueba) VALUES (${demo}, ${oper}, 10, 1, 10, '{}', 1, true)`);
  await consultarDueno(`INSERT INTO cne.pagos_confirmados (mjrv_id, acta_id, importe_usd, tipo_cambio, importe_eur, funciones_verificadas, operador_id, enlace_id, es_prueba) VALUES (${demo}, (SELECT id FROM cne.actas_pago LIMIT 1), 10, 1, 10, true, ${oper}, ${enl}, true)`);
  await consultarDueno(`INSERT INTO cne.envios_credencial (mjrv_id, canal, destino) VALUES (${demo}, 'correo', 'prueba@ejemplo.invalid')`);
  // D01: cargos asumidos y fichas abiertas, de prueba y reales.
  await consultarDueno(`INSERT INTO cne.asignaciones_cargo (mjrv_id, junta_id, cargo, origen, actor_tipo, actor_id, actor_nombre, es_prueba) VALUES (${demo}, (SELECT id FROM cne.juntas_madrid ORDER BY id LIMIT 1), 'vocal', 'manual', 'madrid_admin', 1, 'A', true)`);
  await consultarDueno(`INSERT INTO cne.fichas_abiertas_finanzas (mjrv_id, enlace_id, operador_nombre, es_prueba) VALUES (${demo}, ${enl}, 'Operador Prueba', true)`);
  await consultarDueno("INSERT INTO cne.asignaciones_cargo (mjrv_id, junta_id, cargo, origen, actor_tipo, actor_id, actor_nombre, es_prueba) SELECT id, junta_origen_id, 'vocal', 'manual', 'madrid_admin', 1, 'A', false FROM cne.mjrv WHERE cedula = '9999999999'");
  await consultarDueno("INSERT INTO cne.fichas_abiertas_finanzas (mjrv_id, enlace_id, operador_nombre, es_prueba) SELECT id, (SELECT id FROM cne.enlaces_estacion LIMIT 1), 'Operador Real', false FROM cne.mjrv WHERE cedula = '9999999999'");
  // Un registro real (modo elección imaginario): no debe tocarse.
  await consultarDueno("INSERT INTO cne.lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id, es_prueba) SELECT '9999999999', m.id, 'valido', (SELECT id FROM cne.operadores_madrid LIMIT 1), (SELECT id FROM cne.enlaces_estacion LIMIT 1), false FROM cne.mjrv m WHERE m.cedula = '9999999999'");
  await consultarDueno("INSERT INTO cne.envios_credencial (mjrv_id, canal, destino) SELECT id, 'correo', 'real@ejemplo.invalid' FROM cne.mjrv WHERE cedula = '9999999999'");
  await consultarDueno("UPDATE cne.secuencia_recibos SET ultimo_ordinal = CASE WHEN es_prueba THEN 20 ELSE 17 END");
}

describe("Borrar datos de prueba y preparar para elección", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await cargarDemo(sesion());
    await sembrarActividad();
  });
  afterAll(closePools);

  it("solo la superadmin; sin la frase no hace nada ni respalda", async () => {
    let llamado = false;
    const espia = async () => { llamado = true; return { archivo: "x", bytes: 1 }; };
    await expect(prepararEleccion(sesion("madrid_admin"), "PREPARAR ELECCIÓN", espia)).rejects.toThrow("superadministración");
    expect(await prepararEleccion(sesion(), "si", espia)).toMatchObject({ ok: false });
    expect(llamado).toBe(false);
    expect(await n("cne.lecturas_puerta")).toBe(2);
  });

  it("el resumen cuenta solo lo de prueba y no cambia nada", async () => {
    const r = await resumenLimpieza();
    expect(Object.fromEntries(r.map((x) => [x.tabla, x.n]))).toMatchObject({ lecturas_puerta: 1, actas_pago: 1, pagos_confirmados: 1, mjrv: 570, envios_credencial: 1, asignaciones_cargo: 1, fichas_abiertas_finanzas: 1 });
    expect((await consultarDueno<{ modo: string }>("SELECT modo FROM cne.configuracion"))[0].modo).toBe("prueba");
  });

  it("si el respaldo falla no se limpia nada y el modo no cambia", async () => {
    const r = await prepararEleccion(sesion(), "preparar elección", async () => { throw new Error("No se pudo crear el respaldo (prueba)."); });
    expect(r).toMatchObject({ ok: false });
    expect(await n("cne.mjrv WHERE es_prueba")).toBe(570);
    expect(await n("cne.respaldo_limpieza")).toBe(0);
    expect((await consultarDueno<{ modo: string }>("SELECT modo FROM cne.configuracion"))[0].modo).toBe("prueba");
  });

  it("con pg_dump real: respalda, borra solo la prueba, conserva lo demás y pasa a elección", async () => {
    const r = await prepararEleccion(sesion(), "Preparar elección");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ruta = rutaRespaldo(r.respaldo.archivo);
    expect(ruta).toBeTruthy();
    expect(r.respaldo.bytes).toBeGreaterThan(1024);
    expect(await n("cne.mjrv WHERE es_prueba")).toBe(0);
    expect(await n("cne.mjrv")).toBe(1);
    expect(await n("cne.lecturas_puerta")).toBe(1); // la real
    expect(await n("cne.lecturas_puerta WHERE es_prueba")).toBe(0);
    expect(await n("cne.actas_pago")).toBe(0);
    expect(await n("cne.pagos_confirmados")).toBe(0);
    expect(await consultarDueno("SELECT es_prueba, ultimo_ordinal FROM cne.secuencia_recibos ORDER BY es_prueba")).toEqual([
      { es_prueba: false, ultimo_ordinal: 17 }, { es_prueba: true, ultimo_ordinal: 0 },
    ]);
    expect(await n("cne.asignaciones_cargo")).toBe(1); // la real
    expect(await n("cne.asignaciones_cargo WHERE es_prueba")).toBe(0);
    expect(await n("cne.fichas_abiertas_finanzas")).toBe(1);
    expect(await n("cne.fichas_abiertas_finanzas WHERE es_prueba")).toBe(0);
    expect(await n("cne.envios_credencial")).toBe(1);
    expect(await n("cne.operadores_madrid")).toBe(1);
    expect(await n("cne.enlaces_estacion")).toBe(1);
    expect(await n("cne.juntas_madrid")).toBe(95);
    expect(await n("cne.usuarios WHERE tipo = 'superadmin'")).toBe(1);
    expect((await consultarDueno<{ modo: string }>("SELECT modo FROM cne.configuracion"))[0].modo).toBe("eleccion");
    // Copia interna del lote y auditoría.
    const copia = await consultarDueno<{ tabla: string; n: number }>("SELECT tabla, count(*)::int AS n FROM cne.respaldo_limpieza WHERE lote = $1 GROUP BY tabla", [r.lote]);
    expect(Object.fromEntries(copia.map((c) => [c.tabla, c.n]))).toMatchObject({ mjrv: 570, lecturas_puerta: 1, pagos_confirmados: 1 });
    expect(await n("cne.auditoria WHERE accion = 'eleccion_preparada'")).toBe(1);
    if (ruta && existsSync(ruta)) rmSync(ruta);
  });

  it("repetir no borra nada", async () => {
    const antes = await n("cne.lecturas_puerta");
    const r = await prepararEleccion(sesion(), "PREPARAR ELECCION");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.antes.every((x) => x.n === 0)).toBe(true);
      const ruta = rutaRespaldo(r.respaldo.archivo);
      if (ruta) rmSync(ruta);
    }
    expect(await n("cne.lecturas_puerta")).toBe(antes);
    expect(await n("cne.mjrv")).toBe(1);
    expect(await n("cne.envios_credencial")).toBe(1);
  });

  it("el nombre del respaldo se valida (sin rutas ni archivos ajenos)", () => {
    expect(rutaRespaldo("../etc/passwd")).toBeNull();
    expect(rutaRespaldo("cne-prep-20260101T000000Z.dump")).toBeNull(); // no existe
  });

  it("crearRespaldo falla con mensaje claro si pg_dump no puede conectar", async () => {
    const guardado = process.env.DATABASE_OWNER_URL;
    process.env.DATABASE_OWNER_URL = "postgres://nadie:mala@127.0.0.1:1/cne";
    await expect(crearRespaldo()).rejects.toThrow(/No se pudo crear el respaldo/);
    process.env.DATABASE_OWNER_URL = guardado;
  });
});
