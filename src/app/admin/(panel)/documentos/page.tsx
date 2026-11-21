import { SOLO_CONSUL } from "@/domain/roles";
import { formularioAbierto } from "@/server/documentos";
import { requireAdmin } from "@/server/guard";
import { urlBase } from "@/server/url";

export default async function Documentos() {
  await requireAdmin({ roles: SOLO_CONSUL });
  const [abierto, base] = await Promise.all([formularioAbierto(), urlBase()]);
  return (
    <main className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Documentos de identidad</h1>
      <p>El formulario público del QR ({base}/d) está <strong>{abierto ? "ABIERTO" : "CERRADO"}</strong>.</p>
      <p><a className="font-semibold underline" target="_blank" rel="noreferrer" href="/admin/documentos/cartel">Descargar cartel A4 con el QR</a></p>
      {!abierto && <p>Solicite la apertura del formulario a Superadministración antes de compartirlo.</p>}
    </main>
  );
}
