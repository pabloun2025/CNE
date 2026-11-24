import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools } from "@/server/db";
import { comprobarCola, lineasRecuento } from "@/server/envios/comprobar-cola";
import { consultarDueno, reiniciarBase } from "./helpers/db";

// Fichas ficticias: la serie interna H es masculino (letra M) y la M es femenino (letra F).
async function ficha(n: number, serie: "H" | "M", numero: number, rotulo: string | null): Promise<number> {
  const [r] = await consultarDueno<{ id: number }>(
    `INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id, correo, telefono_e164, rotulo_credencial)
     SELECT $1, 'APELLIDO PRUEBA ' || $1, 'NOMBRE PRUEBA', 'VOCAL', 'vocal', id, 'prueba' || $1 || '@ejemplo.invalid', '+3460000' || $1, $4
       FROM cne.juntas_madrid WHERE serie = $2 AND numero = $3 RETURNING id`, [String(n).padStart(10, "0"), serie, numero, rotulo]);
  return r.id;
}
const encolar = (id: number, canal: string, rect = false, simulado = false) =>
  consultarDueno("INSERT INTO cne.envios_credencial (mjrv_id, canal, destino, estado, simulado, whatsapp_rectificacion) VALUES ($1, $2, 'destino', 'en_cola', $3, $4)", [id, canal, simulado, rect]);

describe("comprobación de la cola sin enviar", () => {
  beforeAll(async () => {
    await reiniciarBase();
    // Rótulos guardados con la letra antigua: la salida debe llevar la pública.
    const h = await ficha(1, "H", 12, "H12"), m = await ficha(2, "M", 5, "M5"), libre = await ficha(3, "H", 13, "Puesto H13");
    await encolar(h, "whatsapp"); await encolar(m, "whatsapp", true); await encolar(m, "correo"); await encolar(libre, "correo");
    await encolar(h, "correo", false, true); // simulado: no cuenta
  });
  afterAll(closePools);

  it("cuenta por línea y tipo, sin incoherencias, y no escribe en la base", async () => {
    const antes = await consultarDueno("SELECT id, estado, intentos FROM cne.envios_credencial ORDER BY id");
    const r = await comprobarCola();
    const g = Object.fromEntries(r.map((x) => [x.grupo, x]));
    expect(g["whatsapp línea 1 · normal"]).toMatchObject({ total: 1, letraM_serieH: 1, incoherentes: 0, textoConSerieInterna: 0 });
    expect(g["whatsapp línea 1 · rectificación"]).toMatchObject({ total: 1, letraF_serieM: 1, incoherentes: 0 });
    expect(g["correo · normal"]).toMatchObject({ total: 2, letraF_serieM: 1, letraM_serieH: 1, textoLibre: 0, incoherentes: 0 });
    expect(await consultarDueno("SELECT id, estado, intentos FROM cne.envios_credencial ORDER BY id")).toEqual(antes);
    expect(lineasRecuento(r).join("\n")).not.toMatch(/PRUEBA|@|\+34/);
  });

  it("detecta una ficha cuya zona no corresponde a la junta", async () => {
    await consultarDueno("UPDATE cne.juntas_madrid SET zona_color = 'verde' WHERE serie = 'M' AND numero = 5");
    const r = await comprobarCola();
    await consultarDueno("UPDATE cne.juntas_madrid SET zona_color = 'rojo' WHERE serie = 'M' AND numero = 5");
    expect(r.reduce((n, x) => n + x.incoherentes, 0)).toBeGreaterThan(0);
  });
  it("marca como incoherente un turno que perdió su credencial", async () => {
    const id = await ficha(4, "H", 12, null);
    await encolar(id, "whatsapp");
    await consultarDueno("UPDATE cne.mjrv SET activo = false WHERE id = $1", [id]);
    const resultados = await comprobarCola();
    expect(resultados.find((r) => r.grupo === "whatsapp línea 1 · normal")).toMatchObject({ sinCredencial: 1, incoherentes: 1 });
  });

});
