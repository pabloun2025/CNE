import { FormCrearAdmin, FormModo, FormRestablecer } from "@/components/superadmin-formularios";
import { leerModo } from "@/server/config";
import { requireSuperadmin } from "@/server/guard";
import { activarAdminAccion } from "@/server/superadmin-actions";
import { FRASE_MODO, listarAdmins } from "@/server/superadmin";

export default async function SuperInicio() {
  const sesion = await requireSuperadmin();
  const [modo, admins] = await Promise.all([leerModo(), listarAdmins(sesion)]);
  const destino = modo === "prueba" ? "eleccion" : "prueba";
  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <section>
        <h1 className="text-xl font-semibold">Modo del sistema</h1>
        <p className="mt-1">Ahora: <strong>{modo === "prueba" ? "MODO PRUEBA" : "MODO ELECCIÓN"}</strong>.</p>
        {modo === "prueba" ? (
          <p className="mt-1 text-sm">Pasar a elección sin «Preparar elección» oculta los registros de prueba pero no los borra.</p>
        ) : (
          <p className="mt-1 text-sm">Volver a prueba mostraría de nuevo los registros de prueba.</p>
        )}
        <div className="mt-3 max-w-sm"><FormModo destino={destino} frase={FRASE_MODO[destino]} /></div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Cuentas de administración Madrid</h2>
        {admins.length === 0 && <p className="mt-2">Aún no hay cuentas. Cree la primera.</p>}
        <ul className="mt-2 divide-y">
          {admins.map((a) => (
            <li key={a.id} className="space-y-2 py-3">
              <p className="font-medium">{a.nombre} <span className="font-normal text-slate-600">· {a.correo}</span></p>
              <p className="text-sm">{a.activo ? "Activa" : "Desactivada"}{a.debe_cambiar ? " · debe cambiar la contraseña" : ""}</p>
              <div className="flex flex-wrap items-start gap-2">
                <form action={activarAdminAccion}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="activo" value={a.activo ? "0" : "1"} />
                  <button className="rounded border border-slate-500 px-3 py-2 text-sm font-medium">{a.activo ? "Desactivar" : "Reactivar"}</button>
                </form>
                <FormRestablecer id={a.id} />
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 max-w-sm">
          <h3 className="font-medium">Nueva cuenta</h3>
          <FormCrearAdmin />
        </div>
      </section>
    </main>
  );
}
