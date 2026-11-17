import { describe, expect, it } from "vitest";
import { proponer, type DecisionProp, type JuntaProp, type PersonaProp } from "@/domain/propuestas";

const J = (id: number, serie: "H" | "M", numero: number, zona: JuntaProp["zona"], orden: number): JuntaProp => ({ id, serie, numero, zona, orden_cercania: orden });
const juntas = [J(1, "H", 7, "amarillo", 4), J(2, "H", 15, "amarillo", 4), J(3, "H", 30, "azul", 3), J(4, "M", 12, "celeste", 1), J(5, "M", 35, "verde", 5)];
let n = 0;
const P = (junta: number, o: Partial<PersonaProp> = {}): PersonaProp => { n++; return { id: n, rol: "vocal", junta_origen_id: junta, junta_actual_id: junta, ingresado: true, con_excepcion: false, apellidos: `APELLIDO ${String(n).padStart(3, "0")}`, nombres: "N", cedula: String(n).padStart(10, "0"), ...o }; };
const de = (cuantos: number, junta: number, o: Partial<PersonaProp> = {}) => Array.from({ length: cuantos }, () => P(junta, o));
const sup = (cuantos: number, junta: number) => de(cuantos, junta, { rol: "suplente" });

describe("propuestas de redistribución", () => {
  it("misma zona antes que otra", () => {
    // H15 (amarillo) con 2; suplentes sobrantes en H7 (amarillo) y en H30 (azul, más cercano en número).
    const personas = [...de(2, 2), ...de(3, 1), ...sup(1, 1), ...de(3, 3), ...sup(1, 3)];
    const r = proponer(juntas, personas, [])!;
    expect(r).toMatchObject({ destino: "H15", origen: "H7", mismaZona: true, origenQuedaria: 3 });
    expect(r.motivo).toBe("H15 tiene 2 presentes; H7 quedaría con 3.");
  });

  it("si no hay en la misma zona, la zona más cercana", () => {
    // Destino M35 (verde, orden 5); suplentes en H30 (azul, 3) y M12 (celeste, 1): |5-3|=2 < |5-1|=4.
    const personas = [...de(2, 5), ...de(3, 3), ...sup(1, 3), ...de(3, 4), ...sup(1, 4)];
    expect(proponer(juntas, personas, [])).toMatchObject({ destino: "M35", origen: "H30", mismaZona: false });
  });

  it("nunca deja el origen con menos de 3", () => {
    expect(proponer(juntas, [...de(1, 2), ...de(2, 1), ...sup(1, 1)], [])).toBeNull(); // H7 tendría 3 presentes: quedaría con 2
    expect(proponer(juntas, [...de(1, 2), ...de(3, 1), ...sup(1, 1)], [])).not.toBeNull();
  });

  it("destinos con menos faltantes primero, y los de 0 al final", () => {
    const personas = [...de(1, 2), ...de(2, 3), ...sup(2, 1), ...de(3, 1)];
    expect(proponer(juntas, personas, [])!.destino).toBe("H30"); // 2 presentes (falta 1) antes que H15 con 1
    const soloCero = [...sup(1, 1), ...de(3, 1)]; // H15, H30, M12, M35 sin nadie
    expect(proponer(juntas, soloCero, [])!.destino).toBe("H15");
  });

  it("respeta «pasada» (par persona-destino) y «no_viable» (persona), y se rehabilita", () => {
    const personas = [...de(2, 2), ...de(3, 1), ...sup(2, 1)];
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
    expect(proponer(juntas, personas, [pasada, noViable, { ...noViable, mjrv_id: primera.mjrvId }, { ...noViable, rehabilitada: true }])).toBeNull();
    expect(proponer(juntas, personas, [pasada, { ...noViable, mjrv_id: primera.mjrvId }, { ...noViable, rehabilitada: true }])!.mjrvId).toBe(segunda.mjrvId);
  });

  it("no propone a quien tiene excepción o no ha ingresado, ni titulares", () => {
    const personas = [...de(2, 2), ...de(3, 1), P(1, { rol: "suplente", con_excepcion: true }), P(1, { rol: "suplente", ingresado: false }), P(1, { rol: "vocal" })];
    expect(proponer(juntas, personas, [])).toBeNull();
  });

  it("sin juntas incompletas no hay propuesta", () => {
    expect(proponer(juntas.slice(0, 1), [...de(3, 1), ...sup(2, 1)], [])).toBeNull();
  });

  it("es determinista: la misma situación da la misma propuesta", () => {
    const personas = [...de(2, 2), ...de(3, 1), ...sup(3, 1), ...de(3, 3), ...sup(2, 3)];
    const a = proponer(juntas, personas, []);
    const b = proponer(juntas, [...personas].reverse(), []);
    expect(b).toEqual(a);
  });
});
