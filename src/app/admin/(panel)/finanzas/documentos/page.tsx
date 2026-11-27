import { SeguimientoDocumental } from "@/components/documentos-finanzas";
import { PestanasFinanzas } from "@/components/pestanas-finanzas";
import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { listarDocumentosFinanzas } from "@/server/documentos";
import { requireAdmin } from "@/server/guard";

export default async function Documentos() {
  await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  const { fichas, modo } = await listarDocumentosFinanzas();
  return (
    <main className="stack-lg">
      <h1>Seguimiento documental</h1>
      <PestanasFinanzas />
      <SeguimientoDocumental key={modo} fichas={fichas} modo={modo} />
    </main>
  );
}
