import Link from "next/link";
import { ListaMjrvSeleccion } from "@/components/lista-mjrv-seleccion";
import { SOLO_CONSUL } from "@/domain/roles";
import { requireAdmin } from "@/server/guard";
import { listarMjrv } from "@/server/mjrv";

const campo = "rounded border border-slate-400 px-2 py-2 text-base";

export default async function ListaMjrv({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin({ roles: SOLO_CONSUL });
  const f = await searchParams;
  const filas = await listarMjrv({ junta: f.junta, rol: f.rol, estado: f.estado || "todos", q: f.q });
  return (
    <main>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">MJRV</h1>
        <Link href="/admin/mjrv/nueva" className="rounded bg-blue-700 px-4 py-2 font-semibold text-white">Nueva ficha</Link>
        <Link href="/admin/mjrv/importar" className="rounded border border-slate-500 px-4 py-2 font-semibold">Importar Excel</Link>
        <Link href="/admin/credenciales/imprimir" className="rounded border border-slate-500 px-4 py-2 font-semibold">Imprimir planchas A4</Link>
      </div>
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" type="search" aria-label="Apellidos o cédula" defaultValue={f.q} placeholder="Apellidos o cédula" className={`${campo} min-w-0 max-w-full`} />
        <input name="junta" aria-label="Junta" defaultValue={f.junta} placeholder="Junta (H12)" className={`${campo} w-28`} />
        <select name="rol" aria-label="Cargo" defaultValue={f.rol ?? ""} className={campo}>
          <option value="">Todos los cargos</option>
          {["presidente", "secretario", "vocal", "suplente", "otro"].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select name="estado" aria-label="Estado" defaultValue={f.estado ?? ""} className={campo}>
          <option value="">Todos los estados</option><option value="activos">Activos</option><option value="ingresado">Ingresados</option><option value="no_ingresado">Sin ingresar</option><option value="baja">De baja</option>
        </select>
        <button className="rounded bg-slate-800 px-4 py-2 font-semibold text-white">Filtrar</button>
      </form>
      {filas.length === 0 && <p>{f.q || f.junta || f.rol || f.estado ? "No hay fichas que coincidan con los filtros." : "No hay fichas cargadas. Puede crear una ficha o importar el Excel de MJRV."}</p>}
      <ListaMjrvSeleccion key={JSON.stringify([f.junta, f.rol, f.estado, f.q])} filas={filas} />
    </main>
  );
}
