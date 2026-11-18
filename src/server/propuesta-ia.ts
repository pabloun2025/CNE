// Único punto que pide la propuesta al Ollama de teinvito.
// No copia el modelo ni sus pesos: viven en el contenedor teinvito-prod-ollama-1.
// CNE solo cambia la pregunta y el formato. El puerto 11434 no está publicado en el anfitrión.

export type CandidatoIa = {
  mjrvId: number; destinoId: number;
  persona: string; origen: string; destino: string; zona: string; distancia: number; mismaZona: boolean;
};

const PRINCIPAL = "qwen2.5:7b";
const RESERVA = "qwen2.5:1.5b";
const URL_DEFECTO = "http://teinvito-ollama:11434";
const TOPE = 8;

const sistema = "Eliges un solo traslado de suplente para el primer hueco. La lista ya cumple las reglas. Prefiere la misma zona de color y, entre esos, el más cercano. Responde solo JSON con mjrvId y destinoId copiados de una línea. No inventes personas.";

export function cuerpoChat(modelo: string, candidatos: CandidatoIa[]) {
  const lineas = candidatos.map((c) => `${c.mjrvId} ${c.destinoId} ${c.persona} ${c.origen}→${c.destino} zona ${c.zona} distancia ${c.distancia} ${c.mismaZona ? "misma zona" : "otra zona"}`);
  return {
    model: modelo,
    stream: false,
    keep_alive: "30m",
    options: { temperature: 0, num_predict: 120 },
    format: {
      type: "object",
      properties: { mjrvId: { type: "integer" }, destinoId: { type: "integer" } },
      required: ["mjrvId", "destinoId"],
    },
    messages: [
      { role: "system", content: sistema },
      { role: "user", content: lineas.join("\n") },
    ],
  };
}

// Solo vale un par que ya estaba en la lista. Cualquier otro id se descarta.
export function leerRespuesta(texto: string, candidatos: CandidatoIa[]): { mjrvId: number; destinoId: number } | null {
  const trozo = texto.match(/\{[\s\S]*\}/);
  if (!trozo) return null;
  let dato: { mjrvId?: unknown; destinoId?: unknown };
  try { dato = JSON.parse(trozo[0]) as { mjrvId?: unknown; destinoId?: unknown }; } catch { return null; }
  const mjrvId = Number(dato.mjrvId);
  const destinoId = Number(dato.destinoId);
  return candidatos.some((c) => c.mjrvId === mjrvId && c.destinoId === destinoId) ? { mjrvId, destinoId } : null;
}

type RespuestaChat = { message?: { content?: string } };

// El visor pregunta cada pocos segundos: no se vuelve a inferir la misma lista enseguida.
let cache: { clave: string; valor: { mjrvId: number; destinoId: number } | null; hasta: number } | null = null;

export async function pedirPropuestaIa(candidatos: CandidatoIa[], fetcher: typeof fetch = fetch, base = process.env.LOCAL_AI_URL || URL_DEFECTO): Promise<{ mjrvId: number; destinoId: number } | null> {
  const lista = candidatos.slice(0, TOPE);
  if (lista.length === 0) return null;
  // Vitest no está en la red de teinvito. La llamada real se prueba con un fetch falso.
  if (process.env.VITEST && fetcher === fetch) return null;
  const clave = `${base}\n${lista.map((c) => `${c.mjrvId}:${c.destinoId}`).join(",")}`;
  if (fetcher === fetch && cache && cache.clave === clave && cache.hasta > Date.now()) return cache.valor;
  const valor = await preguntar(lista, fetcher, base.replace(/\/$/, ""));
  if (fetcher === fetch) cache = { clave, valor, hasta: Date.now() + 15000 };
  return valor;
}

async function preguntar(lista: CandidatoIa[], fetcher: typeof fetch, base: string): Promise<{ mjrvId: number; destinoId: number } | null> {
  const principal = await chat(PRINCIPAL, lista, fetcher, base);
  if (principal !== "modelo") return principal;
  const reserva = await chat(RESERVA, lista, fetcher, base);
  return reserva === "modelo" ? null : reserva;
}

async function chat(modelo: string, lista: CandidatoIa[], fetcher: typeof fetch, base: string): Promise<{ mjrvId: number; destinoId: number } | null | "modelo"> {
  try {
    const r = await fetcher(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpoChat(modelo, lista)),
      signal: AbortSignal.timeout(4000),
    });
    if (r.status === 404) return "modelo";
    if (!r.ok) return null;
    const json = (await r.json()) as RespuestaChat;
    return leerRespuesta(json.message?.content ?? "", lista);
  } catch {
    return null;
  }
}
