import { TODOS_LOS_ROLES } from "@/domain/roles";
import { CascaronAdmin } from "@/components/menu-admin";
import { requireAdmin } from "@/server/guard";

export default async function PanelAdmin({ children }: { children: React.ReactNode }) {
  const sesion = await requireAdmin({ roles: TODOS_LOS_ROLES });
  return <CascaronAdmin nombre={sesion.nombre} rol={sesion.rol}>{children}</CascaronAdmin>;
}
