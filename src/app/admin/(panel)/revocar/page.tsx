import { SOLO_CONSUL } from "@/domain/roles";
import { FormRevocarFuera } from "@/components/form-revocar-fuera";
import { requireAdmin } from "@/server/guard";
import { revocarCredencialAccion } from "@/server/revocar-actions";
import { listarActivos, listarFueraDeLista } from "@/server/revocar-credencial";

export default async function Revocar({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin({ roles: SOLO_CONSUL });
  const q = (await searchParams).q;
  const [activos, fuera] = await Promise.all([listarActivos(q), listarFueraDeLista()]);
  return (
    <main className="max-w-3xl space-y-8">
      <section>
        <h1 className="text-xl font-semibold">Revocar acceso</h1>
        <p className="mt-1 text-sm">MJRV activos. Revocar quita el paso en la puerta. La ficha no se borra.</p>
        <form className="mt-3 flex flex-wrap gap-2">
          <input name="q" defaultValue={q ?? ""} placeholder="Apellidos, nombres o cédula" aria-label="Buscar" className="min-w-0 flex-1 rounded border border-slate-400 px-3 py-2" />
          <button className="rounded bg-slate-800 px-4 py-2 font-semibold text-white">Buscar</button>
        </form>
        {activos.length === 0 ? (
          <p className="mt-3">{q?.trim() ? "Ninguna ficha coincide." : "No hay MJRV activos."}</p>
        ) : (
          <ul className="mt-2 divide-y">
            {activos.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                <p className="min-w-0 flex-1">
                  <span className="font-medium">{m.apellidos}, {m.nombres}</span>
                  <span className="block text-sm text-slate-600">{m.cedula} · {m.junta}</span>
                </p>
                {m.revocada ? <p className="text-sm font-semibold text-red-800">Revocada</p> : (
                  <form action={revocarCredencialAccion}>
                    <input type="hidden" name="id" value={m.id} />
                    <button className="rounded border border-red-600 px-3 py-2 text-sm font-medium text-red-700">Revocar</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {activos.length === 500 && <p className="mt-2 text-sm">Hay más fichas. Acote la búsqueda.</p>}
      </section>

      <section>
        <h2 className="text-xl font-semibold">Fuera de la lista</h2>
        <p className="mt-1 text-sm">Quien no consta en la lista aprobada también se puede revocar.</p>
        <FormRevocarFuera />
        {fuera.length > 0 && (
          <ul className="mt-4 divide-y text-sm">
            {fuera.map((r) => (
              <li key={r.id} className="py-2"><span className="font-medium">{r.apellidos}, {r.nombres}</span> · {r.cedula} · Revocada</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
