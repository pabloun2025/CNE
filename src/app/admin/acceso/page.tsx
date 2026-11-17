import { FormularioAcceso } from "@/components/formulario-acceso";
import { accederAdmin } from "@/server/acceso-actions";

export default function Acceso() {
  return <FormularioAcceso accion={accederAdmin} titulo="Administración Madrid" />;
}
