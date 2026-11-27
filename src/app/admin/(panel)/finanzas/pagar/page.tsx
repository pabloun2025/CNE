import Link from "next/link";
import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { PestanasFinanzas } from "@/components/pestanas-finanzas";
import { ModuloPago } from "@/components/modulo-pago";
import { ColaFinanzas } from "@/components/cola-finanzas";
import { requireAdmin } from "@/server/guard";

export default async function Pagar({ searchParams }: { searchParams: Promise<{ cedula?: string }> }) {
  await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  const cedula = (await searchParams).cedula ?? "";
  return (
    <main className="stack-lg">
      <h1>3. Impresión</h1>
      <PestanasFinanzas />
      <p>Imprima los recibos de las fichas validadas. Cuando tenga el papel, envíe la ficha a Caja.</p>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ColaFinanzas etapa="impresion" />
        <ModuloPago key={cedula} cedulaInicial={cedula} />
      </div>
      <p><Link href="/admin/finanzas/recibos">Consultar recibos y opciones de contingencia</Link></p>
    </main>
  );
}
