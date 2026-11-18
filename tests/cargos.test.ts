import { describe, expect, it } from "vitest";
import { cubrirCargos, textoVacantes, type AsignacionCargo, type PersonaCargo } from "@/domain/cargos";

let n = 0;
const p = (rol: string, o: Partial<PersonaCargo> = {}): PersonaCargo => ({ id: ++n, rol, junta_origen_id: 1, junta_actual_id: 1, ingresado: true, con_excepcion: false, fila_origen: n, apellidos: `A${n}`, ...o });
const cob = (personas: PersonaCargo[], asig: AsignacionCargo[] = [], junta = 1) => cubrirCargos([junta], personas, asig).get(junta)!;
const quien = (c: ReturnType<typeof cob>) => c.cargos.map((x) => `${x.cargo}:${x.mjrvId ?? "-"}:${x.tipo ?? "-"}`);

describe("cubrirCargos", () => {
  it("presidente + secretario titulares + un suplente de la junta: el suplente asume el vocal automáticamente", () => {
    const a = p("presidente"), b = p("secretario"), s = p("suplente");
    const c = cob([a, b, s]);
    expect(quien(c)).toEqual([`presidente:${a.id}:titular`, `secretario:${b.id}:titular`, `vocal:${s.id}:suplente_junta`]);
    expect(c.vacantes).toEqual([]);
    expect(c.transferibles).toEqual([]);
  });

  it("presidente + 2 vocales titulares: falta el secretario y el segundo vocal queda presente sin cargo", () => {
    const a = p("presidente"), v1 = p("vocal"), v2 = p("vocal");
    const c = cob([a, v1, v2]);
    expect(c.vacantes).toEqual(["secretario"]);
    expect(c.sinCargo).toEqual([v2.id]);
    expect(textoVacantes(c.vacantes)).toBe("Falta secretario");
  });

  it("textos de vacantes", () => {
    expect(textoVacantes(["presidente", "vocal"])).toBe("Faltan presidente y vocal");
    expect(textoVacantes(["presidente", "secretario", "vocal"])).toBe("Faltan presidente, secretario y vocal");
    expect(textoVacantes([])).toBe("");
  });

  it("los suplentes cubren las vacantes en orden presidente → secretario → vocal y por fila del Excel", () => {
    const v = p("vocal");
    const s2 = p("suplente", { fila_origen: 20 }), s1 = p("suplente", { fila_origen: 10 }), s3 = p("suplente", { fila_origen: 30 });
    const c = cob([v, s2, s1, s3]);
    expect(quien(c)).toEqual([`presidente:${s1.id}:suplente_junta`, `secretario:${s2.id}:suplente_junta`, `vocal:${v.id}:titular`]);
    expect(c.transferibles).toEqual([s3.id]); // solo sobra con la junta completa
  });

  it("desempate determinista: misma fila → apellidos → id, sin depender del orden de entrada", () => {
    const a = p("suplente", { fila_origen: 5, apellidos: "B" }), b = p("suplente", { fila_origen: 5, apellidos: "A" });
    expect(cob([a, b]).cargos[0].mjrvId).toBe(b.id);
    expect(cob([b, a]).cargos[0].mjrvId).toBe(b.id);
  });

  it("el titular que llega tarde recupera su cargo de manos de un suplente de la junta, pero no de un sustituto explícito", () => {
    const pres = p("presidente", { ingresado: false }), sec = p("secretario"), voc = p("vocal"), sup = p("suplente");
    expect(cob([pres, sec, voc, sup]).cargos[0]).toMatchObject({ mjrvId: sup.id, tipo: "suplente_junta" });
    pres.ingresado = true;
    expect(cob([pres, sec, voc, sup]).cargos[0]).toMatchObject({ mjrvId: pres.id, tipo: "titular" });
    expect(cob([pres, sec, voc, sup]).transferibles).toEqual([sup.id]);
    // Con un sustituto explícito (traslado) en el puesto, el titular queda presente sin cargo.
    const ajeno = p("suplente", { junta_origen_id: 2, junta_actual_id: 1 });
    const c = cob([pres, sec, voc, ajeno], [{ mjrv_id: ajeno.id, junta_id: 1, cargo: "presidente", origen: "traslado" }]);
    expect(c.cargos[0]).toMatchObject({ mjrvId: ajeno.id, tipo: "traslado" });
    expect(c.sinCargo).toEqual([pres.id]);
  });

  it("con una excepción de disponibilidad del sustituto vuelve la vacante", () => {
    const pres = p("presidente"), sec = p("secretario");
    const ajeno = p("suplente", { junta_origen_id: 2, junta_actual_id: 1 });
    const asig: AsignacionCargo[] = [{ mjrv_id: ajeno.id, junta_id: 1, cargo: "vocal", origen: "traslado" }];
    expect(cob([pres, sec, ajeno], asig).vacantes).toEqual([]);
    ajeno.con_excepcion = true;
    expect(cob([pres, sec, ajeno], asig).vacantes).toEqual(["vocal"]);
    ajeno.con_excepcion = false; ajeno.junta_actual_id = 3; // se fue a otra junta: la asignación no cubre nada aquí
    expect(cob([pres, sec, ajeno], asig).vacantes).toEqual(["vocal"]);
  });

  it("quien no ha ingresado no cuenta ni aparece como presente", () => {
    const a = p("presidente", { ingresado: false });
    const c = cob([a]);
    expect(c.presentes).toEqual([]);
    expect(c.vacantes).toHaveLength(3);
  });

  it("incorporado (rol otro) cubre el cargo de su asignación; sin asignación queda sin cargo", () => {
    const pres = p("presidente"), sec = p("secretario"), otro = p("otro");
    expect(cob([pres, sec, otro]).vacantes).toEqual(["vocal"]);
    expect(cob([pres, sec, otro], [{ mjrv_id: otro.id, junta_id: 1, cargo: "vocal", origen: "incorporado" }]).cargos[2]).toMatchObject({ mjrvId: otro.id, tipo: "incorporado" });
  });

  it("un suplente trasladado a otra junta no cubre cargos en la de origen", () => {
    const pres = p("presidente"), sec = p("secretario");
    const movido = p("suplente", { junta_actual_id: 2 });
    expect(cob([pres, sec, movido]).vacantes).toEqual(["vocal"]);
    expect(cob([pres, sec, movido]).transferibles).toEqual([]);
  });
});
