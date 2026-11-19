import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { ModuloPago } from "@/components/modulo-pago";
import { requireAdmin } from "@/server/guard";

export default async function Pagar({ searchParams }: { searchParams: Promise<{ cedula?: string }> }) {
  await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  const cedula = (await searchParams).cedula ?? "";
  return (
    <main className="space-y-4">
      <h1 className="text-xl font-semibold">Módulo de pago</h1>
      <ModuloPago cedulaInicial={cedula} />
    </main>
  );
}
