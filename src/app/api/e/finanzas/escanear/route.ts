import { registrarEscaneoFinanzas } from "@/server/escaneos-finanzas";
import { accesoDirectoEstacion } from "@/server/estaciones";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const e = await accesoDirectoEstacion(request, "finanzas");
  if (!e.ok) return Response.json({ ok: false, mensaje: "Este enlace no tiene acceso al escáner." }, { status: e.status });
  const c = (await request.json().catch(() => null)) as { cedula?: unknown } | null;
  if (typeof c?.cedula !== "string" || !c.cedula.trim() || c.cedula.length > 40) {
    return Response.json({ ok: false, mensaje: "Escanee el QR de la credencial." }, { status: 400 });
  }
  if (!(await registrarEscaneoFinanzas(e.enlace.id, c.cedula))) {
    return Response.json({ ok: false, mensaje: "No se pudo remitir la credencial. Compruebe el QR." }, { status: 404 });
  }
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
