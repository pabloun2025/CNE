import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { ModuloImpresion } from "@/components/modulo-impresion";
import { requireAdmin } from "@/server/guard";

export default async function ImpresionActas() {
  await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  return (
    <main className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Impresión de actas</h1>
      <ModuloImpresion />
    </main>
  );
}
