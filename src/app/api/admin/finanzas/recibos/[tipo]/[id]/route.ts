import { registrarAuditoria } from "@/server/auditoria";
import { cuentaFinanzas } from "@/server/finanzas-cuenta";
import { descargarRecibo } from "@/server/recibos";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ tipo: string; id: string }> }) {
  const cuenta = await cuentaFinanzas();
  if (!cuenta.ok) return cuenta.respuesta;

  const { tipo, id } = await params;
  const n = Number(id);
  if ((tipo !== "acta" && tipo !== "firma") || !Number.isSafeInteger(n) || n < 1) {
    return Response.json({ error: "Referencia de recibo no válida." }, { status: 400 });
  }
  const recibo = await descargarRecibo(tipo, n);
  if (!recibo) return Response.json({ error: "No se encontró el recibo en el modo actual." }, { status: 404 });

  const { sesion } = cuenta;
  await registrarAuditoria({ portal: "finanzas", actorTipo: "usuario", actorId: sesion.usuarioId, actorNombre: sesion.nombre,
    accion: "recibo_descargado", entidad: tipo === "acta" ? "actas_pago" : "firmas_recibo", entidadId: n });
  return new Response(Buffer.from(recibo.pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="recibo-${recibo.numero}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
