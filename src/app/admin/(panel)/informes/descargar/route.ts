import { columnasSolicitadas } from "@/domain/informe";
import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { rechazoAdminApi, sesionApi } from "@/server/guard";
import { resumenFinanzas } from "@/server/finanzas-resumen";
import { informeCierreExcel } from "@/server/informe-excel";
import { informeCierrePdf } from "@/server/pdf/informe";

export const dynamic = "force-dynamic";

// GET /admin/informes/descargar?formato=pdf|xlsx — sin fotos; el total sale solo de pagos confirmados.
export async function GET(request: Request) {
  if (!(await sesionApi("admin", CONSUL_Y_FINANCIERO))) return rechazoAdminApi();
  const params = new URL(request.url).searchParams;
  const formato = params.get("formato");
  if (formato !== "pdf" && formato !== "xlsx") return new Response("Formato no válido", { status: 400 });
  const columnas = columnasSolicitadas(params);
  if (!columnas) return new Response("Columna de informe no válida", { status: 400 });
  const r = await resumenFinanzas();
  const datos = { generadoEn: r.generado_en, modoPrueba: r.modoPrueba, totalEur: r.totalEur, filas: r.filas };
  const sello = r.generado_en.slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  const cuerpo = formato === "pdf" ? Buffer.from(await informeCierrePdf(datos, columnas)) : informeCierreExcel(datos, columnas);
  return new Response(new Uint8Array(cuerpo), {
    headers: {
      "content-type": formato === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="informe-cierre-madrid-${sello}.${formato}"`,
      "cache-control": "no-store",
    },
  });
}
