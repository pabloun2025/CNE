import { describe, expect, it } from "vitest";
import { cuerpoChat, leerRespuesta, pedirPropuestaIa, type CandidatoIa } from "@/server/propuesta-ia";

const lista: CandidatoIa[] = [
  { mjrvId: 2, destinoId: 9, persona: "APELLIDO PRUEBA, N", origen: "H7", destino: "H15", zona: "amarillo", distancia: 0, mismaZona: true },
  { mjrvId: 4, destinoId: 9, persona: "APELLIDO PRUEBA 2, N", origen: "H30", destino: "H15", zona: "amarillo", distancia: 1, mismaZona: false },
];

const fetcherDe = (responder: (modelo: string) => Response) => {
  const modelos: string[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    expect(String(url)).toBe("http://teinvito-ollama:11434/api/chat");
    const cuerpo = JSON.parse(String(init?.body)) as { model: string; stream: boolean };
    modelos.push(cuerpo.model);
    expect(cuerpo.stream).toBe(false);
    return responder(cuerpo.model);
  }) as typeof fetch;
  return { fetcher, modelos };
};

describe("propuesta al Ollama de teinvito", () => {
  it("arma una sola pregunta al chat, con el modelo principal y sin copiar el de WhatsApp", () => {
    const cuerpo = cuerpoChat("qwen2.5:7b", lista);
    expect(cuerpo).toMatchObject({ model: "qwen2.5:7b", stream: false, options: { temperature: 0 }, format: { required: ["mjrvId", "destinoId"] } });
    expect(JSON.stringify(cuerpo)).not.toMatch(/cancela|confirma|gracias/);
    expect(cuerpo.messages).toHaveLength(2);
  });

  it("acepta un par de la lista y rechaza un id inventado", () => {
    expect(leerRespuesta('{"mjrvId":4,"destinoId":9}', lista)).toEqual({ mjrvId: 4, destinoId: 9 });
    expect(leerRespuesta('{"mjrvId":99,"destinoId":9}', lista)).toBeNull();
    expect(leerRespuesta("no es json", lista)).toBeNull();
  });

  it("usa qwen2.5:7b y, si responde 404, qwen2.5:1.5b", async () => {
    const principal = fetcherDe((modelo) => modelo === "qwen2.5:7b"
      ? new Response("no", { status: 404 })
      : Response.json({ message: { content: '{"mjrvId":2,"destinoId":9}' } }));
    expect(await pedirPropuestaIa(lista, principal.fetcher)).toEqual({ mjrvId: 2, destinoId: 9 });
    expect(principal.modelos).toEqual(["qwen2.5:7b", "qwen2.5:1.5b"]);

    const directo = fetcherDe(() => Response.json({ message: { content: '{"mjrvId":4,"destinoId":9}' } }));
    expect(await pedirPropuestaIa(lista, directo.fetcher)).toEqual({ mjrvId: 4, destinoId: 9 });
    expect(directo.modelos).toEqual(["qwen2.5:7b"]);
  });

  it("si el contenedor no contesta, no hay elección", async () => {
    const caido = fetcherDe(() => { throw new Error("red"); });
    expect(await pedirPropuestaIa(lista, caido.fetcher)).toBeNull();
    expect(await pedirPropuestaIa([], caido.fetcher)).toBeNull();
    expect(caido.modelos).toEqual(["qwen2.5:7b"]);
  });
});
