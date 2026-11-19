import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { FormParametrosPago } from "@/components/form-parametros-pago";
import { requireAdmin } from "@/server/guard";
import { leerParametros } from "@/server/pago";

export default async function Configuracion() {
  await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  const p = await leerParametros();
  return (
    <main className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Configuración</h1>
      <p>El nombre y los dos montos se escriben aquí. Esos valores salen en el acta. No hay fórmula.</p>
      <FormParametrosPago valores={p} />
    </main>
  );
}
