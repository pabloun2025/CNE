import { describe, expect, it } from "vitest";
import { efectoNoViable, juntasConVacantes, proponer, type DecisionProp, type JuntaProp, type PersonaProp } from "@/domain/propuestas";

const J = (id: number, serie: "H" | "M", numero: number, zona: JuntaProp["zona"], orden: number): JuntaProp => ({ id, serie, numero, zona, orden_cercania: orden });
const juntas = [J(1, "H", 7, "amarillo", 4), J(2, "H", 15, "amarillo", 4), J(3, "H", 30, "azul", 3), J(4, "M", 12, "celeste", 1), J(5, "M", 35, "verde", 5)];
let n = 0;
const P = (junta: number, rol: string, o: Partial<PersonaProp> = {}): PersonaProp => { n++; return { id: n, rol, junta_origen_id: junta, junta_actual_id: junta, ingresado: true, con_excepcion: false, fila_origen: n, apellidos: `APELLIDO ${String(n).padStart(3, "0")}`, nombres: "N", cedula: String(n).padStart(10, "0"), ...o }; };
const titulares = (junta: number) => [P(junta, "presidente"), P(junta, "secretario"), P(junta, "vocal")];
const sup = (cuantos: number, junta: number) => Array.from({ length: cuantos }, () => P(junta, "suplente"));
// Una junta completa con `extra` suplentes que sobran (transferibles).
const conSobrantes = (junta: number, extra: number) => [...titulares(junta), ...sup(extra, junta)];
// Destino con presidente y secretario: le falta el vocal.
const faltaVocal = (junta: number) => [P(junta, "presidente"), P(junta, "secretario")];

describe("propuestas de redistribución por cargos", () => {
  it("misma zona antes que otra, y el cargo propuesto es la vacante del destino", () => {
    // H15 (amarillo) sin vocal; suplentes sobrantes en H7 (amarillo) y en H30 (azul, más cercano en número).
    const personas = [...faltaVocal(2), ...conSobrantes(1, 1), ...conSobrantes(3, 1)];
    const r = proponer(juntas, personas, [])!;
    expect(r).toMatchObject({ destino: "M15", origen: "M7", mismaZona: true, origenQuedaria: 3, cargo: "vocal", vacantes: ["vocal"] });
    expect(r.motivo).toBe("M15 no tiene vocal; M7 sigue completa (queda con 3).");
  });

  it("si no hay en la misma zona, la zona más cercana", () => {
    // Destino M35 (verde, orden 5); suplentes en H30 (azul, 3) y M12 (celeste, 1): |5-3|=2 < |5-1|=4.
    const personas = [...faltaVocal(5), ...conSobrantes(3, 1), ...conSobrantes(4, 1)];
    expect(proponer(juntas, personas, [])).toMatchObject({ destino: "F35", origen: "M30", mismaZona: false });
  });

  it("un suplente que cubre un cargo en su propia junta nunca se propone", () => {
    // H7 tiene presidente y secretario y un solo suplente: ese suplente hace de vocal, no es transferible.
    expect(proponer(juntas, [...faltaVocal(2), ...faltaVocal(1), ...sup(1, 1)], [])).toBeNull();
    // Con un segundo suplente sobrante, sale solo el sobrante (el de menor fila queda de vocal).
    const personas = [...faltaVocal(2), ...faltaVocal(1)];
    const [primero, segundo] = sup(2, 1);
    expect(proponer(juntas, [...personas, primero, segundo], [])!.mjrvId).toBe(segundo.id);
  });

  it("la primera vacante es el cargo propuesto y salen todas las vacantes del destino", () => {
    const r = proponer(juntas, [P(2, "presidente"), ...conSobrantes(1, 1)], [])!;
    expect(r).toMatchObject({ destino: "M15", cargo: "secretario", vacantes: ["secretario", "vocal"] });
  });

  it("destinos con una vacante primero, después dos, y las de nadie (tres) al final", () => {
    const personas = [P(2, "presidente"), ...faltaVocal(3), ...conSobrantes(1, 2)];
    expect(proponer(juntas, personas, [])!.destino).toBe("M30"); // le falta 1 antes que H15 (le faltan 2)
    const soloCero = [...conSobrantes(1, 1)]; // H15, H30, M12, M35 sin nadie
    expect(proponer(juntas, soloCero, [])!.destino).toBe("M15");
  });

  it("respeta «pasada» (par persona-destino) y «no_viable» (persona), y se rehabilita", () => {
    const personas = [...faltaVocal(2), ...conSobrantes(1, 2)];
    const primera = proponer(juntas, personas, [])!;
    const pasada: DecisionProp = { mjrv_id: primera.mjrvId, junta_destino_id: primera.destinoId, decision: "pasada", rehabilitada: false };
    const segunda = proponer(juntas, personas, [pasada])!;
    expect(segunda.mjrvId).not.toBe(primera.mjrvId);
    const noViable: DecisionProp = { mjrv_id: segunda.mjrvId, junta_destino_id: 99, decision: "no_viable", rehabilitada: false };
    // «Pasada» solo excluye el par: la primera persona sigue disponible para otro destino.
    const tercera = proponer(juntas, personas, [pasada, noViable])!;
    expect(tercera.mjrvId).toBe(primera.mjrvId);
    expect(tercera.destino).not.toBe(primera.destino);
    // «No viable» excluye a la persona para todos los destinos, hasta que se rehabilite.
    const sinNadie = proponer(juntas, personas, [pasada, noViable, { ...noViable, mjrv_id: primera.mjrvId }]);
    expect(sinNadie).toBeNull();
    expect(proponer(juntas, personas, [pasada, { ...noViable, mjrv_id: primera.mjrvId }, { ...noViable, rehabilitada: true }])!.mjrvId).toBe(segunda.mjrvId);
  });

  it("no quiere cierra todos los huecos; no contesta o ya no está solo cierran ese", () => {
    expect(efectoNoViable("No quiere")).toBe("desiste");
    expect(efectoNoViable("Ya no está")).toBe("hueco");
    expect(efectoNoViable("No contesta")).toBe("hueco");
    const personas = [...faltaVocal(2), ...faltaVocal(3), ...conSobrantes(1, 2)];
    const [a, b] = personas.filter((p) => p.rol === "suplente" && p.junta_origen_id === 1);
    const primera = proponer(juntas, personas, [])!;
    expect(primera).toMatchObject({ mjrvId: a.id, destino: "M15" });
    const cierra = (id: number, destino: number, motivo: string): DecisionProp => ({ mjrv_id: id, junta_destino_id: destino, decision: "no_viable", motivo, rehabilitada: false });
    const trasA = proponer(juntas, personas, [cierra(a.id, primera.destinoId, "No contesta")])!;
    expect(trasA).toMatchObject({ mjrvId: b.id, destino: "M15" });
    const trasB = proponer(juntas, personas, [cierra(a.id, primera.destinoId, "Ya no está"), cierra(b.id, trasA.destinoId, "No contesta")])!;
    expect(trasB).toMatchObject({ mjrvId: a.id, destino: "M30" });
    expect(proponer(juntas, personas, [cierra(a.id, primera.destinoId, "No quiere"), cierra(b.id, trasA.destinoId, "No contesta")])!.mjrvId).toBe(b.id);
    expect(proponer(juntas, personas, [cierra(a.id, primera.destinoId, "No quiere"), cierra(b.id, trasB.destinoId, "No quiere")])).toBeNull();
  });

  it("no propone a quien tiene excepción o no ha ingresado, ni titulares", () => {
    const personas = [...faltaVocal(2), ...titulares(1), P(1, "suplente", { con_excepcion: true }), P(1, "suplente", { ingresado: false }), P(1, "vocal")];
    expect(proponer(juntas, personas, [])).toBeNull();
  });

  it("sin juntas con vacantes no hay propuesta; sin candidatos se avisa de las juntas que piden ayuda", () => {
    expect(proponer(juntas.slice(0, 1), conSobrantes(1, 2), [])).toBeNull();
    const personas = [...faltaVocal(2), ...titulares(1)]; // nadie sobra
    expect(proponer(juntas, personas, [])).toBeNull();
    expect(juntasConVacantes(juntas, personas, [])).toBe(1); // solo H15 (las de «nadie» no cuentan)
  });

  it("un traslado ya asignado cubre el cargo y deja de ser vacante", () => {
    const personas = [...faltaVocal(2), ...conSobrantes(1, 2)];
    const movida = P(1, "suplente", { junta_actual_id: 2 });
    expect(proponer(juntas.slice(0, 2), [...personas, movida], [], [{ mjrv_id: movida.id, junta_id: 2, cargo: "vocal", origen: "traslado" }])).toBeNull();
  });

  it("es determinista: la misma situación da la misma propuesta", () => {
    const personas = [...faltaVocal(2), ...conSobrantes(1, 3), ...faltaVocal(3), ...conSobrantes(4, 2)];
    const a = proponer(juntas, personas, []);
    const b = proponer(juntas, [...personas].reverse(), []);
    expect(b).toEqual(a);
  });
});
