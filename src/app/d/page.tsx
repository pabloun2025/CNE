import { FormularioDocumentos } from "@/components/formulario-documentos";
import { Masthead } from "@/components/marca";
import { formularioAbierto } from "@/server/documentos";

export const dynamic = "force-dynamic";

export default async function Documentos() {
  if (!(await formularioAbierto())) {
    return (
      <div className="funcionario sheet">
        <Masthead titulo="CNE 2026" detalle="Madrid" />
        <main>
          <h1>Formulario cerrado</h1>
          <p>Este formulario no está disponible ahora. Pida ayuda al personal.</p>
        </main>
      </div>
    );
  }
  return <FormularioDocumentos />;
}
