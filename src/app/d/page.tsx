import { FormularioDocumentos } from "@/components/formulario-documentos";
import { formularioAbierto } from "@/server/documentos";

export const dynamic = "force-dynamic";

export default async function Documentos() {
  if (!(await formularioAbierto())) {
    return (
      <main className="funcionario mx-auto max-w-md p-6">
        <h1 className="text-xl font-semibold">Formulario cerrado</h1>
        <p className="mt-2">Este formulario no está disponible ahora. Pida ayuda al personal.</p>
      </main>
    );
  }
  return <FormularioDocumentos />;
}
