import { TODOS_LOS_ROLES } from "@/domain/roles";
import { InicioAdmin } from "@/components/inicio-admin";
import { requireAdmin } from "@/server/guard";

export default async function AdminInicio() {
  await requireAdmin({ roles: TODOS_LOS_ROLES });
  return (
    <main className="max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">Administración Madrid</h1>
      <InicioAdmin />
    </main>
  );
}
