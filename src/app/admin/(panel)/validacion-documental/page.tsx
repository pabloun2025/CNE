import { DOCUMENTACION_ADMIN } from "@/domain/roles";
import { requireAdmin } from "@/server/guard";
import { SeguimientoDocumental } from "@/components/documentos-finanzas";
import { listarDocumentosFinanzas } from "@/server/documentos";

export default async function ValidacionDocumental() {
  await requireAdmin({ roles: DOCUMENTACION_ADMIN });
  const { fichas, modo } = await listarDocumentosFinanzas();
  return (
    <main className="stack-lg">
      <h1>Validación de documentos</h1>
      <SeguimientoDocumental key={modo} fichas={fichas} modo={modo} validacion />
    </main>
  );
}
