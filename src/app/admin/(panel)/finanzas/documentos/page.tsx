import { RevisionVentanilla } from "@/components/documentos-finanzas";
import { PestanasFinanzas } from "@/components/pestanas-finanzas";
import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { listarDocumentosFinanzas } from "@/server/documentos";
import { requireAdmin } from "@/server/guard";

export default async function Documentos({ searchParams }: { searchParams: Promise<{ cedula?: string }> }) {
  await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  const [{ fichas, modo }, { cedula }] = await Promise.all([listarDocumentosFinanzas(), searchParams]);
  return (
    <main className="stack-lg">
      <h1>Revisión de documentos</h1>
      <PestanasFinanzas />
      <p>Revise primero la cola de ventanilla. Cuando valide el documento, la ficha aparecerá en Impresión.</p>
      <RevisionVentanilla key={modo} fichas={fichas} modo={modo} cedulaInicial={cedula} />
    </main>
  );
}
