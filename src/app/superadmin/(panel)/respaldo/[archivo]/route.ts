import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { sesionApi } from "@/server/guard";
import { rutaRespaldo } from "@/server/respaldo";

// Descarga del respaldo previo a la limpieza: solo superadministración; el nombre se valida (sin rutas).
export async function GET(_: Request, { params }: { params: Promise<{ archivo: string }> }) {
  const sesion = await sesionApi("superadmin");
  if (!sesion) return new Response("No autorizado.", { status: 401 });
  const { archivo } = await params;
  const ruta = rutaRespaldo(archivo);
  if (!ruta) return new Response("No existe ese respaldo (se borra al reiniciar el servidor).", { status: 404 });
  return new Response(Readable.toWeb(createReadStream(ruta)) as ReadableStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(statSync(ruta).size),
      "Content-Disposition": `attachment; filename="${archivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
