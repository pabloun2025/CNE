import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { PanelFinanciero } from "@/components/panel-financiero";
import { FormParametrosPago } from "@/components/form-parametros-pago";
import { faltanParametros, montosParaActa } from "@/domain/pago";
import { requireAdmin } from "@/server/guard";
import { leerParametros } from "@/server/pago";

export default async function Finanzas() {
  await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  const p = await leerParametros();
  const faltan = faltanParametros(p);
  const imp = montosParaActa(p);
  return (
    <main className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">Finanzas</h1>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Panel financiero</h2>
        <PanelFinanciero />
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Parámetros de pago</h2>
        {faltan.length > 0 ? (
          <p role="alert" className="rounded bg-amber-100 p-2 font-medium text-amber-900">Parámetros de pago pendientes de aprobación. Faltan: {faltan.join(", ")}. Mientras tanto no se pueden confirmar pagos y las actas salen como borrador.</p>
        ) : (
          <p className="rounded bg-green-100 p-2 font-medium text-green-900">Parámetros completos. Valor en euros: {imp.estado === "ok" ? `${imp.eur} EUR` : "—"}. Monto en dólares: {imp.estado === "ok" ? `${imp.usd} USD` : "—"}.</p>
        )}
        <FormParametrosPago valores={p} />
      </section>
    </main>
  );
}
