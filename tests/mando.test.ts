import { describe, expect, it } from "vitest";
import { calcularMando, filtrarJuntas, type JuntaEntrada, type PersonaEntrada } from "@/domain/mando";

const juntas: JuntaEntrada[] = [
  { id: 1, serie: "H", numero: 12, zona: "amarillo" },
  { id: 2, serie: "H", numero: 13, zona: "amarillo" },
  { id: 3, serie: "M", numero: 1, zona: "rojo" },
];
let n = 0;
const persona = (junta: number, o: Partial<PersonaEntrada> = {}): PersonaEntrada => ({ id: ++n, rol: "vocal", junta_origen_id: junta, junta_actual_id: junta, ingresado: true, con_excepcion: false, ...o });
const de = (cuantos: number, junta: number, o: Partial<PersonaEntrada> = {}) => Array.from({ length: cuantos }, () => persona(junta, o));
const j = (r: ReturnType<typeof calcularMando>, id: number) => r.juntas.find((x) => x.id === id)!;

describe("estado de las juntas", () => {
  it("0 presentes rojo «Nadie»; 1–2 ámbar «Faltan n»; 3 o más verde", () => {
    for (const [cuantos, estado, texto] of [[0, "nadie", "Nadie"], [1, "faltan", "Faltan 2"], [2, "faltan", "Faltan 1"], [3, "completa", "3 presentes"], [4, "completa", "4 presentes"]] as const) {
      const r = calcularMando(juntas, de(cuantos, 1), []);
      expect(j(r, 1)).toMatchObject({ presentes: cuantos, estado, texto });
    }
  });

  it("una excepción activa resta y quien no ha ingresado no cuenta", () => {
    const r = calcularMando(juntas, [...de(3, 1), persona(1, { con_excepcion: true }), persona(1, { ingresado: false })], []);
    expect(j(r, 1).presentes).toBe(3);
    const r2 = calcularMando(juntas, [...de(2, 1), persona(1, { con_excepcion: true })], []);
    expect(j(r2, 1)).toMatchObject({ presentes: 2, estado: "faltan" });
  });

  it("un movimiento cambia la junta vigente: la persona cuenta en el destino, y ambas juntas llevan la marca ⇄", () => {
    const movida = persona(1, { rol: "suplente", junta_actual_id: 2 });
    const r = calcularMando(juntas, [...de(3, 1), ...de(2, 2), movida], [{ junta_origen_id: 1, junta_destino_id: 2 }]);
    expect(j(r, 2)).toMatchObject({ presentes: 3, estado: "completa", movimiento: true });
    expect(j(r, 1)).toMatchObject({ presentes: 3, movimiento: true });
    expect(j(r, 3).movimiento).toBe(false);
  });

  it("suplentes transferibles: solo los que sobran sobre 3", () => {
    const r = calcularMando(juntas, [...de(2, 1), persona(1, { rol: "suplente" }), persona(1, { rol: "suplente" }), persona(1, { rol: "suplente" })], []);
    expect(j(r, 1)).toMatchObject({ presentes: 5, transferibles: 2 });
    expect(r.indicadores.transferibles).toBe(2);
    expect(j(calcularMando(juntas, [...de(2, 1), persona(1, { rol: "suplente" })], []), 1).transferibles).toBe(0);
  });

  it("indicadores globales", () => {
    const r = calcularMando(juntas, [...de(3, 1), ...de(1, 2), persona(3, { ingresado: false })], []);
    expect(r.indicadores).toEqual({ ingresados: 4, total: 5, completas: 1, incompletas: 1, sinNadie: 1, transferibles: 0 });
  });

  it("filtro «faltan» ordena faltan 1, faltan 2, nadie; los demás filtros", () => {
    const todas = calcularMando(juntas, [...de(2, 2), ...de(1, 3), ...de(3, 1)], []).juntas;
    expect(filtrarJuntas(todas, "faltan").map((x) => x.id)).toEqual([2, 3]);
    const con0 = calcularMando(juntas, [...de(1, 3), ...de(2, 2)], []).juntas;
    expect(filtrarJuntas(con0, "faltan").map((x) => `${x.serie}${x.numero}`)).toEqual(["H13", "M1", "H12"]);
    expect(filtrarJuntas(todas, "completas").map((x) => x.id)).toEqual([1]);
    expect(filtrarJuntas(todas, "todas")).toHaveLength(3);
  });

  it("con la demostración y 3 lecturas en H12 aparece verde; con 1, ámbar «Faltan 2»", () => {
    expect(j(calcularMando(juntas, de(3, 1), []), 1).estado).toBe("completa");
    expect(j(calcularMando(juntas, de(1, 1), []), 1).texto).toBe("Faltan 2");
  });
});
