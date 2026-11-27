import { registrarCorteJustificante } from "@/server/justificante/servicio";
import { peticion, privado } from "@/server/justificante/http";

export function POST(request: Request) {
  return peticion(request, async ({ token }) => {
    await registrarCorteJustificante(token);
    return new Response(null, { status: 204, headers: privado });
  });
}
