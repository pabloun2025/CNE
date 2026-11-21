import { SOLO_CONSUL } from "@/domain/roles";
import { requireAdmin } from "@/server/guard";
import { urlBase } from "@/server/url";

export default async function Documentos() {
  await requireAdmin({ roles: SOLO_CONSUL });
  const enlace = `${await urlBase()}/d`;
  return (
    <main className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Documentos de identidad</h1>
      <p>Formulario público de cédula o pasaporte <a className="underline break-all" href={enlace} target="_blank" rel="noreferrer">{enlace}</a></p>
      <a className="button-like secondary" target="_blank" rel="noreferrer" href="/admin/documentos/cartel">Abrir guía A4 de documentos y pago</a>
    </main>
  );
}
