import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generarDemo } from "@/domain/demo";
import type { Sesion } from "@/server/auth";
import { closePools } from "@/server/db";
import { cargarDemo, quitarDemo } from "@/server/demo";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const sesion = (tipo: string): Sesion => ({ sesionId: "x", usuarioId: 1, correo: "s@x.y", nombre: "S", tipo, rol: "consul", debeCambiar: false, mfaVerificada: true });

describe("datos de demostración", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.usuarios (tipo, correo, nombre, password_hash) VALUES ('superadmin','s@x.y','S','x') ON CONFLICT DO NOTHING");
  });
  afterAll(closePools);

  it("el dominio genera 6 fichas por junta, ficticias y con cédulas 0000000001…0000000570", () => {
    const f = generarDemo([{ serie: "M", numero: 1 }, { serie: "H", numero: 1 }]);
    expect(f).toHaveLength(12);
    expect(f[0]).toMatchObject({ cedula: "0000000001", apellidos: "APELLIDO PRUEBA 001", nombres: "NOMBRE PRUEBA", cargo: "PRESIDENTE", rotulo: "H01" });
    expect(f.map((x) => x.rol).slice(0, 6)).toEqual(["presidente", "secretario", "vocal", "suplente", "suplente", "suplente"]);
    expect(f[6].rotulo).toBe("M01");
  });

  it("solo la superadmin carga o quita la demostración", async () => {
    await expect(cargarDemo(sesion("madrid_admin"))).rejects.toThrow("superadministración");
  });

  it("cargar dos veces no duplica: 570 fichas, 6 por cada una de las 95 juntas", async () => {
    expect((await cargarDemo(sesion("superadmin"))).insertadas).toBe(570);
    expect((await cargarDemo(sesion("superadmin"))).insertadas).toBe(0);
    const [r] = await consultarDueno<{ n: number; juntas: number; mal: number }>(
      "SELECT count(*)::int AS n, count(DISTINCT junta_origen_id)::int AS juntas, count(*) FILTER (WHERE NOT es_prueba OR fuente_archivo NOT LIKE 'DEMO%' OR telefono_e164 IS NOT NULL OR correo IS NOT NULL)::int AS mal FROM cne.mjrv",
    );
    expect(r).toEqual({ n: 570, juntas: 95, mal: 0 });
  });

  it("quitar deja 0 fichas de prueba y no toca las reales ni sus datos", async () => {
    await consultarDueno("INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id) SELECT '9999999999','REAL FICTICIO','X','VOCAL','vocal',id FROM cne.juntas_madrid LIMIT 1");
    expect((await quitarDemo(sesion("superadmin"))).borradas).toBe(570);
    expect((await consultarDueno("SELECT 1 FROM cne.mjrv WHERE es_prueba")).length).toBe(0);
    expect((await consultarDueno("SELECT 1 FROM cne.mjrv WHERE NOT es_prueba")).length).toBe(1);
  });

  it("no funciona en modo elección", async () => {
    await consultarDueno("UPDATE cne.configuracion SET modo = 'eleccion'");
    await expect(cargarDemo(sesion("superadmin"))).rejects.toThrow("modo prueba");
    await consultarDueno("UPDATE cne.configuracion SET modo = 'prueba'");
  });
});
