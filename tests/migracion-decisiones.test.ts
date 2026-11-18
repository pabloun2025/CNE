import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools } from "@/server/db";
import { cargarDemo } from "@/server/demo";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const sesion = { sesionId: "x", usuarioId: 1, correo: "s@x.y", nombre: "S", tipo: "superadmin", rol: "consul" as const, debeCambiar: false };
const MIGRACION = readFileSync("db/migrations/2026-11-19-decisiones-18-11.sql", "utf8");

// Todo se hace en la base de pruebas, con el dueño (sin RLS por superusuario) y filas de prueba.
async function base() {
  await consultarDueno("INSERT INTO cne.operadores_madrid (nombre, pin_hash, funciones) VALUES ('Operador Prueba','x','{puerta}') ON CONFLICT DO NOTHING");
  await consultarDueno("INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('puerta','Puerta 1','\\x0102') ON CONFLICT DO NOTHING");
}

describe("D01 · migración de las decisiones del 18-11", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await cargarDemo(sesion);
    await base();
  });
  afterAll(closePools);

  it("es idempotente: aplicarla otra vez no falla", async () => {
    await consultarDueno(MIGRACION);
    await consultarDueno(MIGRACION);
    const r = await consultarDueno<{ nombre: string }>("SELECT nombre FROM cne.migraciones WHERE nombre LIKE '2026-11-19%'");
    expect(r).toHaveLength(1);
  });

  it("los envíos reales vienen apagados por defecto", async () => {
    const [c] = await consultarDueno<{ whatsapp_real: boolean; correo_real: boolean }>("SELECT whatsapp_real, correo_real FROM cne.configuracion");
    expect(c).toEqual({ whatsapp_real: false, correo_real: false });
  });

  it("acepta reingreso_autorizado y rechaza un resultado raro", async () => {
    const sql = (res: string) => `INSERT INTO cne.lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id, es_prueba) SELECT '0000000001', (SELECT id FROM cne.mjrv LIMIT 1), '${res}', (SELECT id FROM cne.operadores_madrid LIMIT 1), (SELECT id FROM cne.enlaces_estacion LIMIT 1), true`;
    await consultarDueno(sql("reingreso_autorizado"));
    await expect(consultarDueno(sql("valor_raro"))).rejects.toThrow();
  });

  it("dos asignaciones activas del mismo puesto o de la misma persona fallan", async () => {
    const [j] = await consultarDueno<{ id: string }>("SELECT id FROM cne.juntas_madrid ORDER BY id LIMIT 1");
    const m = await consultarDueno<{ id: string }>("SELECT id FROM cne.mjrv WHERE es_prueba ORDER BY id LIMIT 2");
    const ins = (mjrv: string, cargo: string) => `INSERT INTO cne.asignaciones_cargo (mjrv_id, junta_id, cargo, origen, actor_tipo, actor_id, actor_nombre, es_prueba) VALUES (${mjrv}, ${j.id}, '${cargo}', 'manual', 'madrid_admin', 1, 'A', true)`;
    await consultarDueno(ins(m[0].id, "secretario"));
    await expect(consultarDueno(ins(m[1].id, "secretario"))).rejects.toThrow(); // mismo puesto
    await expect(consultarDueno(ins(m[0].id, "vocal"))).rejects.toThrow(); // misma persona
    await consultarDueno("UPDATE cne.asignaciones_cargo SET activa = false, anulada_en = now()");
    await consultarDueno(ins(m[1].id, "secretario")); // anulada la anterior, ya cabe
  });

  it("una persona incorporada sale «ingresada» en la vista sin lectura de puerta", async () => {
    const [m] = await consultarDueno<{ id: string }>("SELECT id FROM cne.mjrv WHERE es_prueba AND id NOT IN (SELECT mjrv_id FROM cne.lecturas_puerta WHERE mjrv_id IS NOT NULL) ORDER BY id LIMIT 1");
    await consultarDueno("UPDATE cne.configuracion SET modo = 'prueba'");
    const antes = await consultarDueno<{ ingresado: boolean }>("SELECT ingresado FROM cne.v_mjrv_asignacion WHERE mjrv_id = $1", [m.id]);
    expect(antes[0].ingresado).toBe(false);
    await consultarDueno("UPDATE cne.mjrv SET incorporado_en = now(), incorporado_por = 'Prueba' WHERE id = $1", [m.id]);
    const despues = await consultarDueno<{ ingresado: boolean }>("SELECT ingresado FROM cne.v_mjrv_asignacion WHERE mjrv_id = $1", [m.id]);
    expect(despues[0].ingresado).toBe(true);
  });
});
