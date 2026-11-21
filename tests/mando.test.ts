import { describe, expect, it } from "vitest";
import { calcularMando, filtrarJuntas, gruposMapaMadrid, type JuntaEntrada, type PersonaEntrada } from "@/domain/mando";
import { TRAMOS } from "@/domain/juntas";

const juntas: JuntaEntrada[] = [
  { id: 1, serie: "H", numero: 12, zona: "amarillo" },
  { id: 2, serie: "H", numero: 13, zona: "amarillo" },
  { id: 3, serie: "M", numero: 1, zona: "rojo" },
];
let n = 0;
const persona = (junta: number, rol: string, o: Partial<PersonaEntrada> = {}): PersonaEntrada => ({ id: ++n, rol, junta_origen_id: junta, junta_actual_id: junta, ingresado: true, con_excepcion: false, fila_origen: n, apellidos: `A${n}`, ...o });
const roles = (junta: number, ...rs: string[]) => rs.map((r) => persona(junta, r));
const completa = (junta: number) => roles(junta, "presidente", "secretario", "vocal");
const j = (r: ReturnType<typeof calcularMando>, id: number) => r.juntas.find((x) => x.id === id)!;

describe("estado de las juntas (tres presentes)", () => {
  it("nadie → rojo; uno o dos → ámbar; tres o más → verde", () => {
    expect(j(calcularMando(juntas, [], []), 1)).toMatchObject({ presentes: 0, faltan: 3, estado: "nadie", texto: "Nadie" });
    expect(j(calcularMando(juntas, roles(1, "presidente"), []), 1)).toMatchObject({ presentes: 1, faltan: 2, estado: "faltan", texto: "Falta gente", vacantes: ["secretario", "vocal"] });
    expect(j(calcularMando(juntas, roles(1, "presidente", "secretario"), []), 1)).toMatchObject({ presentes: 2, faltan: 1, estado: "faltan", texto: "Falta gente" });
    expect(j(calcularMando(juntas, completa(1), []), 1)).toMatchObject({ presentes: 3, faltan: 0, estado: "completa", texto: "3 presentes" });
    expect(j(calcularMando(juntas, [...completa(1), persona(1, "suplente")], []), 1)).toMatchObject({ presentes: 4, faltan: 0, estado: "completa" });
  });

  it("presidente y secretario titulares + un suplente de la propia junta → verde", () => {
    expect(j(calcularMando(juntas, roles(1, "presidente", "secretario", "suplente"), []), 1).estado).toBe("completa");
  });

  it("tres presentes quedan en verde aunque falte un cargo", () => {
    expect(j(calcularMando(juntas, roles(1, "presidente", "vocal", "vocal"), []), 1)).toMatchObject({ presentes: 3, estado: "completa", texto: "3 presentes", vacantes: ["secretario"] });
  });

  it("una excepción activa resta y quien no ha ingresado no cuenta", () => {
    const r = calcularMando(juntas, [...completa(1), persona(1, "suplente", { con_excepcion: true }), persona(1, "suplente", { ingresado: false })], []);
    expect(j(r, 1)).toMatchObject({ presentes: 3, estado: "completa" });
    const r2 = calcularMando(juntas, [...roles(1, "presidente", "secretario"), persona(1, "vocal", { con_excepcion: true })], []);
    expect(j(r2, 1)).toMatchObject({ presentes: 2, faltan: 1, estado: "faltan" });
  });

  it("un traslado con cargo cubre la vacante del destino y deja la marca ⇄ en ambas juntas", () => {
    const movida = persona(1, "suplente", { junta_actual_id: 2 });
    const r = calcularMando(juntas, [...completa(1), ...roles(2, "presidente", "secretario"), movida], [{ junta_origen_id: 1, junta_destino_id: 2 }], [{ mjrv_id: movida.id, junta_id: 2, cargo: "vocal", origen: "traslado" }]);
    expect(j(r, 2)).toMatchObject({ presentes: 3, estado: "completa", movimiento: true });
    expect(j(r, 1)).toMatchObject({ presentes: 3, movimiento: true });
    expect(j(r, 3).movimiento).toBe(false);
    // Sin la asignación el cargo sigue vacante, pero el aro es verde: hay 3 presentes.
    expect(j(calcularMando(juntas, [...completa(1), ...roles(2, "presidente", "secretario"), movida], [{ junta_origen_id: 1, junta_destino_id: 2 }]), 2)).toMatchObject({ presentes: 3, estado: "completa", texto: "3 presentes", vacantes: ["vocal"] });
  });

  it("suplentes transferibles: solo los de la propia junta que sobran con los tres cargos cubiertos", () => {
    const r = calcularMando(juntas, [...completa(1), ...roles(1, "suplente", "suplente")], []);
    expect(j(r, 1)).toMatchObject({ presentes: 5, transferibles: 2 });
    expect(r.indicadores.transferibles).toBe(2);
    expect(j(calcularMando(juntas, [...roles(1, "presidente", "secretario"), persona(1, "suplente")], []), 1).transferibles).toBe(0);
  });

  it("indicadores coherentes con la lista", () => {
    const r = calcularMando(juntas, [...completa(1), ...roles(2, "presidente"), persona(3, "vocal", { ingresado: false })], []);
    expect(r.indicadores).toEqual({ ingresados: 4, total: 5, completas: 1, incompletas: 1, sinNadie: 1, transferibles: 0 });
    expect(r.indicadores.completas + r.indicadores.incompletas + r.indicadores.sinNadie).toBe(r.juntas.length);
  });

  it("filtro «faltan» ordena por número de vacantes (1, 2, 3); los demás filtros", () => {
    const pers = [...roles(2, "presidente", "secretario"), ...roles(3, "presidente"), ...completa(1)];
    const todas = calcularMando(juntas, pers, []).juntas;
    expect(filtrarJuntas(todas, "faltan").map((x) => x.id)).toEqual([2, 3]);
    const con0 = calcularMando(juntas, [...roles(3, "presidente"), ...roles(2, "presidente", "secretario")], []).juntas;
    expect(filtrarJuntas(con0, "faltan").map((x) => `${x.serie}${x.numero}`)).toEqual(["H13", "M1", "H12"]);
    expect(filtrarJuntas(todas, "completas").map((x) => x.id)).toEqual([1]);
    expect(filtrarJuntas(todas, "todas")).toHaveLength(3);
  });
});

describe("mapa de Madrid", () => {
  it("pone primero amarillo y ordena numéricamente aunque cambien las vacantes", () => {
    const mapa: JuntaEntrada[] = [
      { id: 1, serie: "H", numero: 12, zona: "amarillo" },
      { id: 2, serie: "H", numero: 13, zona: "amarillo" },
      { id: 3, serie: "M", numero: 1, zona: "rojo" },
    ];
    // H12 completa (0 vacantes), H13 con una persona (2 vacantes), M1 sin nadie (3 vacantes).
    const juntas = calcularMando(mapa, [...completa(1), ...roles(2, "presidente")], []).juntas;
    const grupos = gruposMapaMadrid(juntas);
    expect(grupos.map((g) => g.zona)).toEqual(["amarillo", "rojo"]);
    expect(grupos[0].filas.flat().map((f) => f.numero)).toEqual([12, 13]);
  });

  it("ubica las 95 juntas en los dos viales y en filas numeradas", () => {
    const entradas = TRAMOS.flatMap(({ serie, desde, hasta, zona }) =>
      Array.from({ length: hasta - desde + 1 }, (_, i) => ({ id: (serie === "H" ? 0 : 41) + desde + i, serie, numero: desde + i, zona })));
    const mapa = gruposMapaMadrid(calcularMando(entradas.reverse(), [], []).juntas);
    expect(mapa.map(({ zona, vial, filas }) => [zona, vial, filas.map((fila) => fila.length)])).toEqual([
      ["amarillo", "este", [10, 11]], ["azul", "este", [10, 10]], ["rojo", "este", [4, 4]],
      ["celeste", "este", [10, 11]], ["verde", "norte", [4, 6]], ["rosado", "norte", [4, 2, 3, 6]],
    ]);
    expect(mapa[0].filas[0].map((j) => j.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(mapa[5].filas.at(-1)?.at(-1)).toMatchObject({ serie: "M", numero: 54 });
    expect(new Set(mapa.flatMap((g) => g.filas.flat()).map((j) => j.id)).size).toBe(95);
  });
});
