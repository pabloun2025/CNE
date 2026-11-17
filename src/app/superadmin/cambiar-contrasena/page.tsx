import { FormularioCambio } from "@/components/formulario-acceso";
import { cambiarContrasenaSuperadmin } from "@/server/acceso-actions";
import { requireSuperadmin } from "@/server/guard";

export default async function Cambiar() {
  const sesion = await requireSuperadmin({ permitirCambio: true });
  return <FormularioCambio accion={cambiarContrasenaSuperadmin} obligatorio={sesion.debeCambiar} />;
}
