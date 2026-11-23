import Link from "next/link";
import { ListaMjrvSeleccion } from "@/components/lista-mjrv-seleccion";
import { CARGOS_FICHA } from "@/domain/cargos-credencial";
import { SOLO_CONSUL } from "@/domain/roles";
import { requireAdmin } from "@/server/guard";
import { leerConfigEnvios } from "@/server/envios-config";
import { listarMjrv } from "@/server/mjrv";

const campo = "rounded border border-slate-400 px-2 py-2 text-base";

export default async function ListaMjrv({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin({ roles: SOLO_CONSUL });
  const f = await searchParams;
  const [filas, cfg] = await Promise.all([listarMjrv({ junta: f.junta, rol: f.rol, estado: f.estado || "todos", q: f.q }), leerConfigEnvios()]);
  return (
    <main>
      <header className="mb-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold">MJRV</h1>
          <Link href="/admin/mjrv/nueva" className="button-like w-full gap-2 sm:w-auto">
            <span aria-hidden="true" className="text-xl leading-none">+</span>
            Crear nueva ficha
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/mjrv/importar" className="button-like secondary">Importar Excel</Link>
          <Link href="/admin/credenciales/imprimir" className="button-like secondary">Imprimir planchas A4</Link>
        </div>
      </header>
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" type="search" aria-label="Apellidos o cédula" defaultValue={f.q} placeholder="Apellidos o cédula" className={`${campo} min-w-0 max-w-full`} />
        <input name="junta" aria-label="Junta" defaultValue={f.junta} placeholder="Junta (H12)" className={`${campo} w-28`} />
        <select name="rol" aria-label="Cargo" defaultValue={f.rol ?? ""} className={`${campo} max-w-full`}>
          <option value="">Todos los cargos</option>
          {CARGOS_FICHA.map((cargo) => <option key={cargo.valor} value={cargo.valor}>{cargo.etiqueta}</option>)}
          <option value="otro">Otros cargos importados</option>
        </select>
        <select name="estado" aria-label="Estado" defaultValue={f.estado ?? ""} className={campo}>
          <option value="">Todos los estados</option><option value="activos">Activos</option><option value="ingresado">Ingresados</option><option value="no_ingresado">Sin ingresar</option><option value="baja">De baja</option>
        </select>
        <button className="rounded bg-slate-800 px-4 py-2 font-semibold text-white">Filtrar</button>
      </form>
      {filas.length === 0 && <p>{f.q || f.junta || f.rol || f.estado ? "No hay fichas que coincidan con los filtros." : "No hay fichas cargadas. Puede crear una ficha o importar el Excel de MJRV."}</p>}
      <ListaMjrvSeleccion key={JSON.stringify([f.junta, f.rol, f.estado, f.q])} filas={filas} numeros={[cfg.whatsappNumero, cfg.whatsappNumero2]} />
    </main>
  );
}
