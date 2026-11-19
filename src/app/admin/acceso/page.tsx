import { FormularioAcceso } from "@/components/formulario-acceso";
import { pideDefinirContrasena } from "@/server/auth";
import { accederAdmin } from "@/server/acceso-actions";

const USUARIO_ADMIN = "admin";

export default async function Acceso() {
  // El primer ingreso ya muestra «Defina su contraseña». Una contraseña vacía no entra.
  // Si la base no responde, se muestra el formulario normal: tampoco entra en blanco.
  let definir = false;
  try {
    definir = await pideDefinirContrasena(USUARIO_ADMIN, null, "admin");
  } catch {
    definir = false;
  }
  return <FormularioAcceso accion={accederAdmin} titulo="Administración Madrid" etiquetaCorreo="Usuario" empezarDefiniendo={definir} usuarioInicial={definir ? USUARIO_ADMIN : undefined} />;
}
