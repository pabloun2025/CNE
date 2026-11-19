import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { PestanasFinanzas } from "@/components/pestanas-finanzas";
import { ModuloPago } from "@/components/modulo-pago";
import { requireAdmin } from "@/server/guard";

export default async function Pagar({ searchParams }: { searchParams: Promise<{ cedula?: string }> }) {
  await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  const cedula = (await searchParams).cedula ?? "";
  return (
    <main className="space-y-4">
      <h1>Módulo de pago</h1>
      <PestanasFinanzas />
      <ModuloPago cedulaInicial={cedula} />
    </main>
  );
}
