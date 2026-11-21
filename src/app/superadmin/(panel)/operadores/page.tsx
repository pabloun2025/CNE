import { FormEnlace, FormOperador, FormPin } from "@/components/admin-operadores";
import { ListaEnlacesEstacion } from "@/components/enlaces-estacion";
import { FUNCION_NOMBRE } from "@/domain/estaciones";
import { activarOperadorAccion } from "@/server/estacion-actions";
import { listarEnlaces, listarOperadores } from "@/server/estaciones";
import { requireSuperadmin } from "@/server/guard";

export default async function AdministrarEstaciones() {
  await requireSuperadmin();
  const [operadores, enlaces] = await Promise.all([listarOperadores(), listarEnlaces()]);
  return (
    <div className="mx-auto max-w-3xl stack-lg">
      <h1>Operadores y enlaces</h1>
      <section className="card stack">
        <h2>Operadores de Mando</h2>
        <ul className="divide-y">
          {operadores.filter((o) => o.funciones.includes("mando")).map((o) => (
            <li key={o.id} className="space-y-2 py-3">
              <p className="font-medium">{o.nombre} {o.apellido} <span className="font-normal text-slate-600">· {FUNCION_NOMBRE.mando}</span></p>
              <p className="text-sm">{o.activo ? "Activo" : "Desactivado"}{o.bloqueado ? " · bloqueado por PIN" : ""}</p>
              <div className="flex flex-wrap items-start gap-3">
                <form action={activarOperadorAccion}>
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="activo" value={o.activo ? "0" : "1"} />
                  <button className="rounded border border-slate-500 px-3 py-2 text-sm font-medium">{o.activo ? "Desactivar" : "Reactivar"}</button>
                </form>
                {o.activo && <FormPin id={o.id} />}
              </div>
            </li>
          ))}
        </ul>
        <h3>Nuevo operador</h3>
        <FormOperador />
      </section>
      <section className="card stack">
        <h2>Enlaces de estación</h2>
        <ListaEnlacesEstacion enlaces={enlaces} administrar />
        <h3>Nuevo enlace</h3>
        <FormEnlace />
      </section>
    </div>
  );
}
