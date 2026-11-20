import { COLUMNAS_INFORME, COLUMNAS_PREDETERMINADAS, OPCIONES_COLUMNAS } from "@/domain/informe";
import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { requireAdmin } from "@/server/guard";

export default async function Informes() {
  await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  const boton = "inline-block rounded bg-blue-700 px-4 py-3 font-semibold text-white";
  return (
    <main className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Informes</h1>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Cierre de finanzas</h2>
        <p className="text-sm">El informe incluye la hora de corte y el total en euros de los pagos confirmados. Las fotografías de cédulas quedan excluidas.</p>
        <form action="/admin/informes/descargar" method="get" className="space-y-4">
          <input type="hidden" name="seleccion" value="1" />
          <fieldset>
            <legend className="mb-2 font-semibold">Columnas del informe</legend>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {OPCIONES_COLUMNAS.map((id) => {
                const columna = COLUMNAS_INFORME[id];
                return (
                  <label key={id} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                    <input type="checkbox" name="columnas" value={id} defaultChecked={COLUMNAS_PREDETERMINADAS.includes(id)} className="size-5 shrink-0 accent-blue-700" />
                    {"etiqueta" in columna ? columna.etiqueta : columna.titulo}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <button className={boton} type="submit" name="formato" value="pdf">Descargar PDF</button>
            <button className={boton} type="submit" name="formato" value="xlsx">Descargar Excel</button>
          </div>
        </form>
      </section>
    </main>
  );
}
