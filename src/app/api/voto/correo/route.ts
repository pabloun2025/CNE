import { enviarJustificante } from "@/server/justificante/servicio";
import { peticion, privado } from "@/server/justificante/http";

export function POST(request: Request) {
  return peticion(request, async ({ sesion, documento, correo }) =>
    Response.json(await enviarJustificante(sesion, documento ?? "", correo), { headers: privado }));
}
