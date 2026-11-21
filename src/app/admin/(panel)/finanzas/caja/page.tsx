import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { PestanasFinanzas } from "@/components/pestanas-finanzas";
import { ModuloPago } from "@/components/modulo-pago";
import { ColaFinanzas } from "@/components/cola-finanzas";
import { requireAdmin } from "@/server/guard";

export default async function Caja({ searchParams }: { searchParams: Promise<{ cedula?: string }> }) {
  await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  const cedula = (await searchParams).cedula ?? "";
  return (
    <main className="stack-lg">
      <h1>Caja</h1>
      <PestanasFinanzas />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ColaFinanzas caja />
        <ModuloPago key={cedula} cedulaInicial={cedula} caja />
      </div>
    </main>
  );
}
