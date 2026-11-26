import { abrirJustificante } from "@/server/justificante/servicio";
import { peticion, privado } from "@/server/justificante/http";
export function POST(request: Request) {
  return peticion(request, async ({ token, solicitud }) => Response.json(await abrirJustificante(token, solicitud), { headers: privado }));
}
