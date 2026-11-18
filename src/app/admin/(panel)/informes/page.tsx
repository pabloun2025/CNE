import { requireAdmin } from "@/server/guard";

export default async function Informes() {
  await requireAdmin();
  const boton = "inline-block rounded bg-blue-700 px-4 py-3 font-semibold text-white";
  return (
    <main className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Informes</h1>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Cierre de finanzas</h2>
        <p className="text-sm">Todas las fichas con su condición (pagada o pendiente), importes, hora y operador, y el total entregado. El total suma solo pagos confirmados. No lleva fotografías. Lleva la hora de corte del momento de la descarga.</p>
        <div className="flex flex-wrap gap-3">
          <a className={boton} href="/admin/informes/descargar?formato=pdf">Descargar PDF</a>
          <a className={boton} href="/admin/informes/descargar?formato=xlsx">Descargar Excel</a>
        </div>
      </section>
    </main>
  );
}
