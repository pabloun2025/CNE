import { ErrorJustificante } from "./servicio";

export const privado = { "cache-control": "no-store, private", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow" };

export async function peticion(request: Request, atender: (datos: Record<string, unknown>) => Promise<Response>) {
  try {
    if (!request.headers.get("content-type")?.startsWith("application/json") ||
        ["cross-site", "same-site"].includes(request.headers.get("sec-fetch-site") ?? ""))
      throw new ErrorJustificante(403, "La solicitud debe realizarse desde el formulario.");
    const reader = request.body?.getReader();
    if (!reader) throw new ErrorJustificante(400, "Faltan los datos del formulario.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) { await reader.cancel(); throw new ErrorJustificante(413, "Solicitud demasiado grande."); }
      chunks.push(value);
    }
    let datos;
    try { datos = JSON.parse(Buffer.concat(chunks).toString()); } catch { /* Formulario inválido. */ }
    if (!datos || typeof datos !== "object" || Array.isArray(datos)) throw new ErrorJustificante(400, "Revise el formulario.");
    return await atender(datos);
  } catch (e) {
    const error = e instanceof ErrorJustificante ? e : new ErrorJustificante(503, "No se pudo completar la solicitud. Vuelva a intentarlo.");
    return Response.json({ error: error.message }, { status: error.status, headers: privado });
  }
}
