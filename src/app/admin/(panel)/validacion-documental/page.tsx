import { DOCUMENTACION_ADMIN } from "@/domain/roles";
import { requireAdmin } from "@/server/guard";
import { Documentacion } from "@/app/e/[token]/trabajo/documentacion";

export default async function ValidacionDocumental() {
  await requireAdmin({ roles: DOCUMENTACION_ADMIN });
  return (
    <main className="stack-lg">
      <h1>Validación de documentos</h1>
      <Documentacion />
    </main>
  );
}
