import { SOLO_CONSUL } from "@/domain/roles";
import { formularioAbierto } from "@/server/documentos";
import { fijarFormularioAccion } from "@/server/documentos-actions";
import { requireAdmin } from "@/server/guard";
import { urlBase } from "@/server/url";

export default async function Documentos() {
  await requireAdmin({ roles: SOLO_CONSUL });
  const [abierto, base] = await Promise.all([formularioAbierto(), urlBase()]);
  return (
    <main className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Documentos de identidad</h1>
      <p>El formulario público del QR ({base}/d) está <strong>{abierto ? "ABIERTO" : "CERRADO"}</strong>.</p>
      <form action={fijarFormularioAccion}>
        <input type="hidden" name="abierto" value={abierto ? "0" : "1"} />
        <button className={`rounded px-5 py-3 font-semibold text-white ${abierto ? "bg-red-700" : "bg-green-700"}`}>{abierto ? "Cerrar formulario" : "Abrir formulario"}</button>
      </form>
      <p><a className="font-semibold underline" target="_blank" href="/admin/documentos/cartel">Descargar cartel A4 con el QR</a></p>
      <p className="text-sm">Cerrado, nadie puede consultar cédulas ni subir fotos desde el QR. Las estaciones de documentación y finanzas siguen funcionando.</p>
    </main>
  );
}
