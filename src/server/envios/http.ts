// Llamadas HTTP a proveedores (copiado de consulares/src/domain/http.ts). Distingue lo que seguro no salió
// (no se pudo conectar) de lo incierto (tiempo agotado, conexión cortada a mitad): lo incierto nunca se reenvía solo.

export type Raw = { kind: "response"; status: number; json: unknown } | { kind: "network"; sent: "no" | "unknown"; error: string };

export type FetchLike = (input: string, init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal }) => Promise<{
  status: number;
  text(): Promise<string>;
}>;

// Resultado de un envío. «incierto»: el proveedor pudo haberlo enviado (tiempo agotado, 5xx).
export type ResultadoProveedor = { ok: true; idExterno: string } | { ok: false; permanente: boolean; error: string; incierto?: boolean; pausarCola?: true };

const NO_ENVIADO = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH", "UND_ERR_CONNECT_TIMEOUT"]);

export async function pedirJson(
  fetchImpl: FetchLike | undefined,
  url: string,
  entrada: { method: string; headers?: Record<string, string>; body?: unknown; timeoutMs: number },
): Promise<Raw> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), entrada.timeoutMs);
  const hacer = fetchImpl ?? (fetch as unknown as FetchLike);
  try {
    const respuesta = await hacer(url, {
      method: entrada.method,
      headers: { "content-type": "application/json", accept: "application/json", ...(entrada.headers ?? {}) },
      body: entrada.body === undefined ? undefined : JSON.stringify(entrada.body),
      signal: controlador.signal,
    });
    const texto = await respuesta.text();
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = null;
    }
    return { kind: "response", status: respuesta.status, json };
  } catch (error) {
    const codigo = codigoDeRed(error);
    return { kind: "network", sent: codigo && NO_ENVIADO.has(codigo) ? "no" : "unknown", error: codigo ?? (error instanceof Error ? error.name : "error") };
  } finally {
    clearTimeout(temporizador);
  }
}

function codigoDeRed(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (error.name === "AbortError") return "TIMEOUT";
  const causa = (error as Error & { cause?: { code?: unknown } }).cause;
  if (causa && typeof causa.code === "string") return causa.code;
  const propio = (error as Error & { code?: unknown }).code;
  return typeof propio === "string" ? propio : null;
}
