import Link from "next/link";
import { PestanasFinanzas } from "@/components/pestanas-finanzas";
import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { requireAdmin } from "@/server/guard";
import { buscarRecibos } from "@/server/recibos";

const fecha = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" });

export default async function Recibos({ searchParams }: { searchParams: Promise<{ q?: string; pagina?: string }> }) {
  await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const solicitada = Number(params.pagina);
  const pagina = Number.isSafeInteger(solicitada) && solicitada > 0 && solicitada <= 10000 ? solicitada : 1;
  const { filas, siguiente } = await buscarRecibos(q, pagina);

  return (
    <main className="stack-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Recibos</h1>
        <Link className="button-like" href="/admin/finanzas/recibos/emitir">Emitir en contingencia</Link>
      </div>
      <PestanasFinanzas />
      <form action="/admin/finanzas/recibos" className="card flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">Nombre, cédula o número de recibo
          <input name="q" type="search" defaultValue={q} maxLength={120} placeholder="Nombre, cédula o MAD-000123" />
        </label>
        <button className="bg-blue-700 px-4 py-2">Buscar</button>
      </form>
      {filas.length === 0 ? (
        <p>{q ? "No se encontraron recibos con esa búsqueda." : "Aún no hay recibos emitidos en el modo actual."}</p>
      ) : (
        <ul className="stack">
          {filas.map((r) => (
            <li key={`${r.tipo}-${r.id}`} className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{r.nombre}</p>
                <p className="text-sm">{r.cedula} · {r.numero} · {fecha.format(r.emitido)}</p>
                <p className="hint">
                  {r.pagado === null ? "Sin vínculo al pago" : r.pagado ? "Pago confirmado" : "Sin pago asociado"}
                  {r.importe && ` · ${r.importe} EUR`}
                  {r.historico && r.tipo === "acta" && " · Emisión histórica"}
                  {r.reconstruido ? " · Copia reconstruida" : r.tipo === "firma" ? " · Firma digital archivada" : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <a className="button-like secondary" href={`/api/admin/finanzas/recibos/${r.tipo}/${r.id}`} aria-label={`Descargar PDF del recibo ${r.numero}`}>Descargar PDF</a>
                <a className="button-like secondary" target="_blank" rel="noopener"
                  href={`/api/admin/finanzas/recibos/${r.tipo}/${r.id}?vista=1`}>Reimprimir</a>
              </div>
            </li>
          ))}
        </ul>
      )}
      {(pagina > 1 || siguiente) && (
        <nav aria-label="Páginas de recibos" className="flex flex-wrap items-center gap-3">
          {pagina > 1 && <Link className="button-like secondary" href={{ pathname: "/admin/finanzas/recibos", query: { q, pagina: pagina - 1 } }}>Anterior</Link>}
          <span>Página {pagina}</span>
          {siguiente && <Link className="button-like secondary" href={{ pathname: "/admin/finanzas/recibos", query: { q, pagina: pagina + 1 } }}>Siguiente</Link>}
        </nav>
      )}
    </main>
  );
}
