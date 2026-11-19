import { describe, expect, it } from "vitest";
import { buscarNombreCamara, buscarPorNombre, type PersonaLista } from "@/domain/puerta-nombre";

const lista: PersonaLista[] = [
  { id: 1, apellidos: "APELLIDO PRUEBA 001", nombres: "NOMBRE PRUEBA" },
  { id: 2, apellidos: "APELLIDO PRUEBA 002", nombres: "NOMBRE PRUEBA" },
  { id: 3, apellidos: "GARCÍA LÓPEZ", nombres: "JUAN" },
  { id: 4, apellidos: "GARCIA LOPEZ", nombres: "JUAN CARLOS" },
];

describe("búsqueda de MJRV por nombre", () => {
  it("el nombre completo, o el apellido solo si es único, encuentra a la persona", () => {
    expect(buscarPorNombre("APELLIDO PRUEBA 001 NOMBRE PRUEBA", lista).map((p) => p.id)).toEqual([1]);
    expect(buscarPorNombre("apellido prueba 001", lista).map((p) => p.id)).toEqual([1]);
    expect(buscarPorNombre("García López Juan", lista).map((p) => p.id)).toEqual([3]);
  });

  it("un apellido compartido no elige a nadie", () => {
    expect(buscarPorNombre("APELLIDO PRUEBA", lista).map((p) => p.id).sort()).toEqual([1, 2]);
    expect(buscarPorNombre("NOMBRE PRUEBA", lista).length).toBeGreaterThan(1);
  });

  it("el nombre más largo gana si el texto lo contiene entero", () => {
    expect(buscarPorNombre("GARCIA LOPEZ JUAN CARLOS", lista).map((p) => p.id)).toEqual([4]);
  });

  it("un texto demasiado corto no busca", () => {
    expect(buscarPorNombre("AB", lista)).toEqual([]);
    expect(buscarPorNombre("   ", lista)).toEqual([]);
  });

  it("la cámara acepta el apellido leído entre otras palabras y calla si hay duda", () => {
    expect(buscarNombreCamara("CREDENCIAL APELLIDO PRUEBA 001 NOMBRE PRUEBA VOCAL", lista).map((p) => p.id)).toEqual([1]);
    expect(buscarNombreCamara("APELLIDO PRUEBA NOMBRE PRUEBA", lista)).toEqual([]);
    expect(buscarNombreCamara("NOMBRE", lista)).toEqual([]);
  });
});
