import Link from "next/link";
import { PestanasFinanzas } from "@/components/pestanas-finanzas";
import { RecibosEmitidos } from "@/components/recibos-emitidos";
import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { requireAdmin } from "@/server/guard";
import { buscarRecibos } from "@/server/recibos";

export default async function Recibos({ searchParams }: { searchParams: Promise<{ q?: string; pagina?: string }> }) {
  await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const solicitada = Number(params.pagina);
  const pagina = Number.isSafeInteger(solicitada) && solicitada > 0 && solicitada <= 10000 ? solicitada : 1;
  const { filas, siguiente, total, modo } = await buscarRecibos(q, pagina);

  return (
    <main className="stack-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Recibos</h1>
        <Link className="button-like" href="/admin/finanzas/recibos/emitir">Emitir recibos numerados</Link>
      </div>
      <PestanasFinanzas />
      <form action="/api/admin/finanzas/recibos/contingencia" method="post" className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2>Actas para completar a mano</h2>
          <p className="hint">Una hoja por integrante del padrón activo, sin fotos. Complete a mano el número y el importe en euros.</p>
        </div>
        <input name="modo" type="hidden" value={modo} />
        <button className="bg-blue-700 px-4 py-2">Descargar PDF de contingencia</button>
      </form>
      <form action="/admin/finanzas/recibos" className="card flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">Nombre, cédula o número de recibo
          <input name="q" type="search" defaultValue={q} maxLength={120} placeholder="Nombre, cédula o MAD-000123" />
        </label>
        <button className="bg-blue-700 px-4 py-2">Buscar</button>
      </form>
      {total === 0 ? (
        <p>{q ? "No se encontraron recibos con esa búsqueda." : "Aún no hay recibos emitidos en el modo actual."}</p>
      ) : (
        <RecibosEmitidos key={`${modo}:${q}`} filas={filas} total={total} modo={modo} q={q} pagina={pagina} />
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
