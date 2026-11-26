import { descargarJustificante } from "@/server/justificante/servicio";
import { peticion, privado } from "@/server/justificante/http";
export function POST(request: Request) {
  return peticion(request, async ({ sesion, documento }) => new Response(Buffer.from(await descargarJustificante(sesion, documento ?? "")), {
    headers: { ...privado, "content-type": "application/pdf", "content-disposition": 'attachment; filename="justificante-laboral.pdf"' },
  }));
}
