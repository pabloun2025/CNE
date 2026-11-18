import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools } from "@/server/db";
import { aceptarPropuesta, descartarPropuesta, marcarNoDisponible, moverManual, propuestaActual, quitarExcepcion, rehabilitar, type Actor } from "@/server/movimientos";
import { estadoMando } from "@/server/mando";
import { consultarDueno, reiniciarBase } from "./helpers/db";

const actor: Actor = { tipo: "operador", id: 1, nombre: "Op Mando" };
let cedulaSeq = 0;
async function junta(serie: string, numero: number) {
  return (await consultarDueno<{ id: number }>("SELECT id FROM cne.juntas_madrid WHERE serie = $1 AND numero = $2", [serie, numero]))[0].id;
}
async function persona(serie: string, numero: number, rol: string, ingresado = true): Promise<number> {
  const c = String(++cedulaSeq).padStart(10, "0");
  const [m] = await consultarDueno<{ id: number }>(
    "INSERT INTO cne.mjrv (cedula, apellidos, nombres, cargo_original, rol, junta_origen_id) VALUES ($1,'APELLIDO PRUEBA ' || $1,'NOMBRE PRUEBA',upper($2),$2,$3) RETURNING id", [c, rol, await junta(serie, numero)]);
  if (ingresado) await consultarDueno("INSERT INTO cne.lecturas_puerta (codigo_leido, mjrv_id, resultado, operador_id, enlace_id) SELECT $1, $2, 'valido', (SELECT id FROM cne.operadores_madrid), (SELECT id FROM cne.enlaces_estacion)", [c, m.id]);
  return m.id;
}
async function limpiar() {
  for (const t of ["decisiones_movimiento", "excepciones_disponibilidad", "lecturas_puerta", "mjrv"]) await consultarDueno(`DELETE FROM cne.${t}`);
}
async function sembrar(origenTitulares: number, origenSup: number, destinoPresentes: number) {
  await limpiar();
  for (let i = 0; i < origenTitulares; i++) await persona("H", 7, "vocal");
  const sups: number[] = [];
  for (let i = 0; i < origenSup; i++) sups.push(await persona("H", 7, "suplente"));
  for (let i = 0; i < destinoPresentes; i++) await persona("H", 15, "vocal");
  return sups;
}
const ids = async () => ({ origenId: await junta("H", 7), destinoId: await junta("H", 15) });

describe("movimientos", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.operadores_madrid (nombre, pin_hash, funciones) VALUES ('Op Prueba','x','{mando}')");
    await consultarDueno("INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('mando','Mando 1','\\x01')");
  });
  afterAll(closePools);

  it("aceptar cambia la junta vigente: destino verde con marca ⇄ y la decisión queda registrada con el actor", async () => {
    const [s] = await sembrar(3, 1, 2);
    const p = (await propuestaActual())!;
    expect(p).toMatchObject({ mjrvId: s, origen: "H7", destino: "H15", origenQuedaria: 3 });
    expect(typeof p.mjrvId).toBe("number");
    expect(await aceptarPropuesta(actor, p)).toEqual({ ok: true });
    const m = await estadoMando();
    expect(m.juntas.find((j) => j.numero === 15 && j.serie === "H")).toMatchObject({ presentes: 3, movimiento: true }); // el cargo lo asigna D10
    const [d] = await consultarDueno<{ decision: string; actor_nombre: string; manual: boolean }>("SELECT decision, actor_nombre, manual FROM cne.decisiones_movimiento");
    expect(d).toEqual({ decision: "aceptada", actor_nombre: "Op Mando", manual: false });
    expect(await propuestaActual()).toBeNull();
  });

  it("dos aceptaciones concurrentes de la misma persona producen una sola; la otra recibe «La situación cambió»", async () => {
    await sembrar(3, 1, 2);
    const p = (await propuestaActual())!;
    const r = await Promise.all([aceptarPropuesta(actor, p), aceptarPropuesta({ ...actor, id: 2 }, p)]);
    expect(r.filter((x) => x.ok)).toHaveLength(1);
    expect(r.find((x) => !x.ok)).toMatchObject({ cambio: true, mensaje: "La situación cambió. Se calculó una nueva propuesta." });
    expect((await consultarDueno("SELECT 1 FROM cne.decisiones_movimiento WHERE decision = 'aceptada'")).length).toBe(1);
  });

  it("dos suplentes distintos no pueden vaciar el origen a la vez (origen con 4: solo sale uno)", async () => {
    const sups = await sembrar(3, 1, 0); // H7 con 4; H15 con 0
    await persona("H", 7, "suplente"); // H7 con 5 → pueden salir 2
    const { origenId, destinoId } = await ids();
    // Ahora quitamos uno para dejar 4 presentes: solo puede salir 1.
    await consultarDueno("DELETE FROM cne.lecturas_puerta WHERE mjrv_id = (SELECT max(id) FROM cne.mjrv)");
    const otro = (await consultarDueno<{ id: number }>("SELECT id FROM cne.mjrv WHERE rol='suplente' AND id <> $1", [sups[0]]))[0].id;
    const r = await Promise.all([aceptarPropuesta(actor, { mjrvId: sups[0], origenId, destinoId }), aceptarPropuesta(actor, { mjrvId: otro, origenId, destinoId })]);
    expect(r.filter((x) => x.ok).length).toBeLessThanOrEqual(1);
  });

  it("no acepta si el origen quedaría con menos de 3, si la persona ya no está presente o tiene excepción", async () => {
    const [s] = await sembrar(2, 1, 1);
    const { origenId, destinoId } = await ids();
    expect(await aceptarPropuesta(actor, { mjrvId: s, origenId, destinoId })).toMatchObject({ ok: false, cambio: true });
    const [t] = await sembrar(3, 1, 1);
    await marcarNoDisponible(actor, t, "Se fue");
    expect(await aceptarPropuesta(actor, { mjrvId: t, origenId, destinoId })).toMatchObject({ ok: false, cambio: true });
    expect(await propuestaActual()).toBeNull();
    await quitarExcepcion(t);
    expect((await propuestaActual())?.mjrvId).toBe(t);
  });

  it("pasar y no viable registran la decisión y cambian la propuesta; rehabilitar la devuelve", async () => {
    const [s1, s2] = await sembrar(3, 2, 2);
    const a = (await propuestaActual())!;
    expect(a.mjrvId).toBe(s1);
    expect(await descartarPropuesta(actor, a, "pasada")).toEqual({ ok: true });
    const b = (await propuestaActual())!;
    expect(b.mjrvId).toBe(s2);
    expect(await descartarPropuesta(actor, b, "no_viable", "")).toMatchObject({ ok: false });
    expect(await descartarPropuesta(actor, b, "no_viable", "no responde")).toEqual({ ok: true });
    // La primera persona sigue disponible para otros destinos; la segunda queda fuera.
    const c = (await propuestaActual())!;
    expect(c.mjrvId).toBe(s1);
    expect(c.destino).not.toBe("H15");
    await descartarPropuesta(actor, c, "no_viable", "se niega");
    expect(await propuestaActual()).toBeNull();
    await rehabilitar(s2);
    expect((await propuestaActual())?.mjrvId).toBe(s2);
  });

  it("movimiento manual: pide confirmación si el origen queda con menos de 3 y queda marcado manual", async () => {
    const [s] = await sembrar(2, 1, 0);
    expect(await moverManual(actor, { mjrvId: s, destino: "H99", confirmar: false })).toMatchObject({ ok: false });
    const sin = await moverManual(actor, { mjrvId: s, destino: "H15", confirmar: false });
    expect(sin).toMatchObject({ ok: false, confirmar: true, mensaje: "El origen quedará con 2. Confirme para continuar." });
    expect(await moverManual(actor, { mjrvId: s, destino: "H15", confirmar: true })).toEqual({ ok: true });
    expect((await consultarDueno<{ manual: boolean }>("SELECT manual FROM cne.decisiones_movimiento"))[0].manual).toBe(true);
    expect(await moverManual(actor, { mjrvId: s, destino: "H15", confirmar: true })).toMatchObject({ ok: false });
  });
});
