import { privado, peticion } from "@/server/justificante/http";
import { exportarContactos } from "@/server/puesto-movil/contactos";
import { ErrorJustificante } from "@/server/justificante/servicio";
import { consultar, diagnosticoCorreo, enviar, estadoMovil, limitar, origenMovilValido, seguimiento, verificarAcceso } from "@/server/puesto-movil/servicio";

type Contexto = { params: Promise<{ operacion: string }> };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: Contexto) {
  if ((await params).operacion !== "estado") return Response.json({ error: "Página no encontrada." }, { status: 404, headers: privado });
  return Response.json(estadoMovil(), { headers: privado });
}

export async function POST(request: Request, { params }: Contexto) {
  const { operacion } = await params;
  const response = await peticion(request, async (datos) => {
    const origen = request.headers.get("origin");
    if (origen && !origenMovilValido(origen)) throw new ErrorJustificante(403, "Abra el enlace en su navegador.");
    if (!["consulta", "envio", "seguimiento", "diagnostico-correo", "contactos"].includes(operacion)) throw new ErrorJustificante(404, "Página no encontrada.");
    verificarAcceso(request, operacion === "seguimiento" || operacion === "diagnostico-correo" || operacion === "contactos");
    limitar(request, operacion);
    if (operacion === "contactos") {
      return new Response(await exportarContactos(), { headers: {
        ...privado,
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": 'attachment; filename="contactos-no-empadronados.xlsx"',
        "x-content-type-options": "nosniff",
      } });
    }
    const resultado = operacion === "consulta" ? await consultar(datos.cedula) :
      operacion === "envio" ? await enviar(datos) : operacion === "diagnostico-correo" ? await diagnosticoCorreo() : await seguimiento();
    return Response.json(resultado, { headers: privado });
  });
  if (response.status === 429) response.headers.set("Retry-After", "60");
  return response;
}
