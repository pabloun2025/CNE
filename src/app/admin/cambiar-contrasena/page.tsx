import { TODOS_LOS_ROLES } from "@/domain/roles";
import { FormularioCambio } from "@/components/formulario-acceso";
import { cambiarContrasenaAdmin } from "@/server/acceso-actions";
import { requireAdmin } from "@/server/guard";

export default async function Cambiar() {
  const sesion = await requireAdmin({ permitirCambio: true, roles: TODOS_LOS_ROLES });
  return <FormularioCambio accion={cambiarContrasenaAdmin} obligatorio={sesion.debeCambiar} />;
}
