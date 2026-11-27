import { MESAS_ADMIN } from "@/domain/roles";
import { VerificacionMesas } from "@/components/verificacion-mesas";
import { requireAdmin } from "@/server/guard";
import { listarPanoramaJuntas } from "@/server/verificacion-mesas";

export default async function PuestoVerificacionMesas() {
  await requireAdmin({ roles: MESAS_ADMIN });
  return (
    <main className="stack-lg">
      <h1>Verificación de mesas</h1>
      <VerificacionMesas juntas={await listarPanoramaJuntas()} />
    </main>
  );
}
