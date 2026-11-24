import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools } from "@/server/db";
import { aceptarPropuesta, asignarCargo, datosPropuesta, descartarPropuesta, marcarNoDisponible, moverManual, propuestaActual, quitarExcepcion, rehabilitar, type Actor } from "@/server/movimientos";
import { detalleJunta, estadoMando } from "@/server/mando";
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
  for (const t of ["asignaciones_cargo", "decisiones_movimiento", "excepciones_disponibilidad", "lecturas_puerta", "mjrv"]) await consultarDueno(`DELETE FROM cne.${t}`);
}
// Origen H7: los tres titulares y `sobrantes` suplentes que sobran. Destino H15: los roles indicados (por defecto presidente y secretario: falta el vocal).
async function sembrar(sobrantes: number, destino: string[] = ["presidente", "secretario"]) {
  await limpiar();
  for (const r of ["presidente", "secretario", "vocal"]) await persona("H", 7, r);
  const sups: number[] = [];
  for (let i = 0; i < sobrantes; i++) sups.push(await persona("H", 7, "suplente"));
  for (const r of destino) await persona("H", 15, r);
  return sups;
}
const ids = async () => ({ origenId: await junta("H", 7), destinoId: await junta("H", 15) });
const asignaciones = () => consultarDueno<{ mjrv_id: number; junta_id: number; cargo: string; origen: string; activa: boolean }>("SELECT mjrv_id, junta_id, cargo, origen, activa FROM cne.asignaciones_cargo ORDER BY id");

describe("movimientos con cargos", () => {
  beforeAll(async () => {
    await reiniciarBase();
    await consultarDueno("INSERT INTO cne.operadores_madrid (nombre, pin_hash, funciones) VALUES ('Op Prueba','x','{mando}')");
    await consultarDueno("INSERT INTO cne.enlaces_estacion (funcion, etiqueta, token_hash) VALUES ('mando','Mando 1','\\x01')");
  });
  afterAll(closePools);

  it("aceptar crea la decisión y la asignación del cargo en la misma operación: destino verde con marca ⇄", async () => {
    const [s] = await sembrar(1);
    const p = (await propuestaActual())!;
    expect(p).toMatchObject({ mjrvId: s, origen: "M7", destino: "M15", origenQuedaria: 3, cargo: "vocal", vacantes: ["vocal"] });
    expect(await aceptarPropuesta(actor, p)).toEqual({ ok: true });
    const { destinoId } = await ids();
    expect(await asignaciones()).toEqual([{ mjrv_id: s, junta_id: destinoId, cargo: "vocal", origen: "traslado", activa: true }]);
    const m = await estadoMando();
    expect(m.juntas.find((j) => j.numero === 15 && j.serie === "H")).toMatchObject({ presentes: 3, estado: "completa", movimiento: true });
    expect((await detalleJunta(destinoId))!.cargos[2]).toMatchObject({ cargo: "vocal", mjrvId: s, tipo: "traslado", etiqueta: "Trasladado desde M7" });
    const [d] = await consultarDueno<{ decision: string; actor_nombre: string; manual: boolean }>("SELECT decision, actor_nombre, manual FROM cne.decisiones_movimiento");
    expect(d).toEqual({ decision: "aceptada", actor_nombre: "Op Mando", manual: false });
    expect(await propuestaActual()).toBeNull();
  });

  it("el cargo es editable: con el destino sin secretario ni vocal se puede aceptar como vocal en vez del propuesto", async () => {
    const [s] = await sembrar(1, ["presidente"]);
    const p = (await propuestaActual())!;
    expect(p).toMatchObject({ cargo: "secretario", vacantes: ["secretario", "vocal"] });
    expect(await aceptarPropuesta(actor, { ...p, cargo: "vocal" })).toEqual({ ok: true });
    expect((await asignaciones())[0]).toMatchObject({ mjrv_id: s, cargo: "vocal" });
    expect(await aceptarPropuesta(actor, { ...p, cargo: "jefe" })).toMatchObject({ ok: false, cambio: true });
  });

  it("dos aceptaciones concurrentes de la misma persona producen una sola; la otra recibe «La situación cambió»", async () => {
    await sembrar(1);
    const p = (await propuestaActual())!;
    const r = await Promise.all([aceptarPropuesta(actor, p), aceptarPropuesta({ ...actor, id: 2 }, p)]);
    expect(r.filter((x) => x.ok)).toHaveLength(1);
    expect(r.find((x) => !x.ok)).toMatchObject({ cambio: true, mensaje: "La situación cambió. Se calculó una nueva propuesta." });
    expect((await consultarDueno("SELECT 1 FROM cne.decisiones_movimiento WHERE decision = 'aceptada'")).length).toBe(1);
    expect((await consultarDueno("SELECT 1 FROM cne.asignaciones_cargo WHERE activa")).length).toBe(1);
  });

  it("dos propuestas distintas al mismo puesto a la vez: solo una; el cargo ya cubierto da «La situación cambió»", async () => {
    const sups = await sembrar(2);
    const { origenId, destinoId } = await ids();
    const r = await Promise.all(sups.map((mjrvId) => aceptarPropuesta(actor, { mjrvId, origenId, destinoId, cargo: "vocal" })));
    expect(r.filter((x) => x.ok)).toHaveLength(1);
    expect(r.find((x) => !x.ok)).toMatchObject({ cambio: true });
    expect((await consultarDueno("SELECT 1 FROM cne.asignaciones_cargo WHERE activa AND cargo = 'vocal'")).length).toBe(1);
    // Cubierto entre medias a mano: la propuesta vieja ya no vale.
    await sembrar(1);
    const [otro] = (await consultarDueno<{ id: number }>("SELECT id FROM cne.mjrv WHERE junta_origen_id = $1 AND rol = 'presidente'", [destinoId])).map((x) => x.id);
    expect(otro).toBeTruthy();
    const extra = await persona("H", 15, "otro");
    expect(await asignarCargo({ ...actor, tipo: "operador" }, { juntaId: destinoId, mjrvId: extra, cargo: "vocal" })).toEqual({ ok: true });
    const [sup] = (await consultarDueno<{ id: number }>("SELECT id FROM cne.mjrv WHERE rol = 'suplente'")).map((x) => x.id);
    expect(await aceptarPropuesta(actor, { mjrvId: sup, origenId, destinoId, cargo: "vocal" })).toMatchObject({ ok: false, cambio: true });
  });

  it("solo se acepta a un suplente transferible: el que cubre un cargo, el ausente o el que tiene excepción, no", async () => {
    // H7 sin vocal: su único suplente hace de vocal y no se puede trasladar.
    await limpiar();
    await persona("H", 7, "presidente"); await persona("H", 7, "secretario");
    const unico = await persona("H", 7, "suplente");
    await persona("H", 15, "presidente"); await persona("H", 15, "secretario");
    const { origenId, destinoId } = await ids();
    expect(await aceptarPropuesta(actor, { mjrvId: unico, origenId, destinoId, cargo: "vocal" })).toMatchObject({ ok: false, cambio: true });
    expect(await propuestaActual()).toBeNull();
    // Con un sobrante y una excepción, deja de ser candidato; al quitarla, vuelve.
    const [t] = await sembrar(1);
    await marcarNoDisponible(actor, t, "Se fue");
    expect(await aceptarPropuesta(actor, { mjrvId: t, origenId, destinoId, cargo: "vocal" })).toMatchObject({ ok: false, cambio: true });
    expect(await propuestaActual()).toBeNull();
    await quitarExcepcion(t);
    expect((await propuestaActual())?.mjrvId).toBe(t);
  });

  it("sin candidatos y con vacantes: el aviso para incorporar un votante", async () => {
    await sembrar(0);
    expect(await datosPropuesta()).toEqual({ propuesta: null, juntasConVacantes: 1 });
  });

  it("pasar y no viable registran la decisión y cambian la propuesta; rehabilitar la devuelve", async () => {
    const [s1, s2] = await sembrar(2);
    const a = (await propuestaActual())!;
    expect(a.mjrvId).toBe(s1);
    expect(await descartarPropuesta(actor, a, "pasada")).toEqual({ ok: true });
    const b = (await propuestaActual())!;
    expect(b.mjrvId).toBe(s2);
    expect(await descartarPropuesta(actor, b, "no_viable", "")).toMatchObject({ ok: false });
    expect(await descartarPropuesta(actor, b, "no_viable", "no responde")).toEqual({ ok: true });
    expect((await consultarDueno("SELECT 1 FROM cne.excepciones_disponibilidad WHERE activa")).length).toBe(0);
    // La primera persona sigue disponible para otros destinos (otras juntas sin nadie); la segunda queda fuera.
    const c = (await propuestaActual())!;
    expect(c.mjrvId).toBe(s1);
    expect(c.destino).not.toBe("H15");
    await rehabilitar(s2);
    expect((await consultarDueno("SELECT 1 FROM cne.decisiones_movimiento WHERE decision = 'no_viable' AND rehabilitada_en IS NULL")).length).toBe(0);
  });

  it("movimiento manual: pide confirmación si la persona cubre un cargo en el origen y queda marcado manual", async () => {
    await limpiar();
    const pres = await persona("H", 7, "presidente"); await persona("H", 7, "secretario"); await persona("H", 7, "vocal");
    const { origenId, destinoId } = await ids();
    expect(await moverManual(actor, { mjrvId: pres, destino: "H99", confirmar: false })).toMatchObject({ ok: false });
    const sin = await moverManual(actor, { mjrvId: pres, destino: "H15", confirmar: false });
    expect(sin).toMatchObject({ ok: false, confirmar: true, mensaje: "M7 quedará sin presidente. ¿Continuar?" });
    expect(await moverManual(actor, { mjrvId: pres, destino: "H15", confirmar: true, cargo: "presidente" })).toEqual({ ok: true });
    expect((await consultarDueno<{ manual: boolean }>("SELECT manual FROM cne.decisiones_movimiento"))[0].manual).toBe(true);
    expect(await asignaciones()).toEqual([{ mjrv_id: pres, junta_id: destinoId, cargo: "presidente", origen: "traslado", activa: true }]);
    expect(await moverManual(actor, { mjrvId: pres, destino: "H15", confirmar: true })).toMatchObject({ ok: false });
    expect((await detalleJunta(origenId))!.cargos[0]).toMatchObject({ cargo: "presidente", mjrvId: null });
  });

  it("movimiento manual de un sobrante: sin confirmación; «sin cargo» no asigna y un cargo ocupado se rechaza", async () => {
    const [s] = await sembrar(1, ["presidente", "secretario", "vocal"]);
    const { destinoId } = await ids();
    expect(await moverManual(actor, { mjrvId: s, destino: "H15", confirmar: false, cargo: "vocal" })).toMatchObject({ ok: false, cambio: true }); // vocal ya cubierto
    expect(await moverManual(actor, { mjrvId: s, destino: "H15", confirmar: false })).toEqual({ ok: true }); // sin cargo
    expect(await asignaciones()).toEqual([]);
    expect((await detalleJunta(destinoId))!.sinCargo.map((x) => x.id)).toEqual([s]);
  });

  it("un suplente de la propia junta no pide confirmación si otro suplente cubre su cargo", async () => {
    await limpiar();
    await persona("H", 7, "presidente"); await persona("H", 7, "secretario");
    const [a, b] = [await persona("H", 7, "suplente"), await persona("H", 7, "suplente")]; // a hace de vocal; b sobra
    expect(await moverManual(actor, { mjrvId: b, destino: "H15", confirmar: false })).toEqual({ ok: true });
    // Mover a «a» (que cubre el vocal) sí pide confirmación: nadie lo reemplazaría.
    expect(await moverManual(actor, { mjrvId: a, destino: "H15", confirmar: false })).toMatchObject({ ok: false, confirmar: true, mensaje: "M7 quedará sin vocal. ¿Continuar?" });
  });

  it("no contesta suelta el asiento y no quiere no; el hueco no se vuelve a proponer", async () => {
    const [s1, s2] = await sembrar(2);
    const a = (await propuestaActual())!;
    expect(a.mjrvId).toBe(s1);
    expect(await descartarPropuesta(actor, a, "no_viable", "No contesta")).toEqual({ ok: true });
    expect((await consultarDueno("SELECT 1 FROM cne.excepciones_disponibilidad WHERE activa AND mjrv_id = $1", [s1])).length).toBe(1);
    const h7 = (await estadoMando()).juntas.find((j) => j.serie === "H" && j.numero === 7)!;
    expect(h7.presentes).toBe(4);
    const b = (await propuestaActual())!;
    expect(b.mjrvId).toBe(s2);
    expect(await descartarPropuesta(actor, b, "no_viable", "No quiere")).toEqual({ ok: true });
    expect((await consultarDueno("SELECT 1 FROM cne.excepciones_disponibilidad WHERE activa")).length).toBe(1);
    await quitarExcepcion(s1);
    const c = (await propuestaActual())!;
    expect(c.mjrvId).toBe(s1);
    expect(c.destino).not.toBe("H15");
  });
});
