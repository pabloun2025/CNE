import { FormularioAcceso } from "@/components/formulario-acceso";
import { accederSuperadmin } from "@/server/acceso-actions";

export default function Acceso() {
  return <FormularioAcceso accion={accederSuperadmin} titulo="Superadministración" permitirDefinir />;
}
