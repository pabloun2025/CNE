import Link from "next/link";
import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { PestanasFinanzas } from "@/components/pestanas-finanzas";
import { PanelFinanciero } from "@/components/panel-financiero";
import { faltanParametros, montosParaActa } from "@/domain/pago";
import { requireAdmin } from "@/server/guard";
import { leerParametros } from "@/server/pago";

export default async function Finanzas() {
  await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  const p = await leerParametros();
  const faltan = faltanParametros(p);
  const imp = montosParaActa(p);
  return (
    <main className="stack-lg">
      <h1>Finanzas</h1>
      <PestanasFinanzas />
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Panel financiero</h2>
        <PanelFinanciero />
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Parámetros de pago</h2>
        {faltan.length > 0 ? (
          <p role="alert" className="border-2 border-stone-900 bg-stone-100 p-2 font-medium">Faltan en configuración: {faltan.join(", ")}. Mientras tanto no se pueden confirmar pagos y las actas salen como borrador. <Link href="/admin/configuracion" className="underline">Ir a configuración</Link></p>
        ) : (
          <p className="cifra border-2 border-stone-900 p-2 font-medium">Importe configurado: {imp.estado === "ok" ? `${imp.eur} EUR` : "pendiente"}. <Link href="/admin/configuracion" className="underline">Cambiar en configuración</Link></p>
        )}
      </section>
    </main>
  );
}
