import { TODOS_LOS_ROLES } from "@/domain/roles";
import { MenuAdmin } from "@/components/menu-admin";
import { requireAdmin } from "@/server/guard";

export default async function PanelAdmin({ children }: { children: React.ReactNode }) {
  const sesion = await requireAdmin({ roles: TODOS_LOS_ROLES });
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <MenuAdmin nombre={sesion.nombre} rol={sesion.rol} />
      <div className="min-w-0 flex-1 p-4">{children}</div>
    </div>
  );
}
