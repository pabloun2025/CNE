import Link from "next/link";
import { requireAdmin } from "@/server/guard";
import { listarMjrv } from "@/server/mjrv";

const campo = "rounded border border-slate-400 px-2 py-2 text-base";

export default async function ListaMjrv({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin();
  const f = await searchParams;
  const filas = await listarMjrv({ junta: f.junta, rol: f.rol, estado: f.estado, q: f.q });
  return (
    <main>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">MJRV</h1>
        <Link href="/admin/mjrv/nueva" className="rounded bg-blue-700 px-4 py-2 font-semibold text-white">Nueva ficha</Link>
        <Link href="/admin/mjrv/importar" className="rounded border border-slate-500 px-4 py-2 font-semibold">Importar Excel</Link>
      </div>
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={f.q} placeholder="Apellidos o cédula" className={campo} />
        <input name="junta" defaultValue={f.junta} placeholder="Junta (H12)" className={`${campo} w-28`} />
        <select name="rol" defaultValue={f.rol ?? ""} className={campo}>
          <option value="">Todos los cargos</option>
          {["presidente", "secretario", "vocal", "suplente", "otro"].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select name="estado" defaultValue={f.estado ?? ""} className={campo}>
          <option value="">Activos</option><option value="ingresado">Ingresados</option><option value="no_ingresado">Sin ingresar</option><option value="baja">De baja</option><option value="todos">Todos</option>
        </select>
        <button className="rounded bg-slate-800 px-4 py-2 font-semibold text-white">Filtrar</button>
      </form>
      {filas.length === 0 ? (
        <p>No hay fichas. Cargue el Excel de MJRV para empezar.</p>
      ) : (
        <div className="overflow-x-auto">
          <p className="mb-1 text-sm">{filas.length}{filas.length === 500 ? "+" : ""} fichas</p>
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b"><th className="p-2">Junta</th><th className="p-2">Persona</th><th className="p-2">Cargo</th><th className="p-2">Estado</th></tr></thead>
            <tbody>
              {filas.map((m) => (
                <tr key={m.id} className="border-b">
                  <td className="p-2 font-semibold">{m.origen}{m.vigente !== m.origen ? ` → ${m.vigente}` : ""}</td>
                  <td className="p-2"><Link className="underline" href={`/admin/mjrv/${m.id}`}>{m.apellidos}, {m.nombres}</Link><div className="text-slate-600">{m.cedula}{m.es_prueba ? " · PRUEBA" : ""}</div></td>
                  <td className="p-2">{m.rol}</td>
                  <td className="p-2">{!m.activo ? "De baja" : m.ingresado ? "Ingresó" : "Sin ingresar"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
