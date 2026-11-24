import Link from "next/link";
import { SeleccionRecibos } from "@/components/seleccion-recibos";
import { leerJuntaPublica } from "@/domain/juntas";
import { CONSUL_Y_FINANCIERO } from "@/domain/roles";
import { MAX_RECIBOS_LOTE } from "@/server/finanzas";
import { leerModo } from "@/server/config";
import { requireAdmin } from "@/server/guard";
import { listarMjrv } from "@/server/mjrv";

export default async function EmitirRecibos({ searchParams }: { searchParams: Promise<{ q?: string; junta?: string }> }) {
  await requireAdmin({ roles: CONSUL_Y_FINANCIERO });
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const junta = typeof params.junta === "string" ? params.junta.trim().slice(0, 12) : "";
  const juntaInvalida = Boolean(junta && !leerJuntaPublica(junta));
  const resultado = juntaInvalida ? [] : await listarMjrv({ q, junta });
  const modo = await leerModo();
  const permitidas = resultado.filter((f) => modo === "prueba" || !f.es_prueba);
  const fichas = permitidas.slice(0, MAX_RECIBOS_LOTE).map((f) => ({
    id: f.id, nombre: `${f.apellidos}, ${f.nombres}`, cedula: f.cedula, junta: f.origen,
  }));
  return (
    <main className="stack-lg">
      <h1>Imprimir recibos por selección</h1>
      <Link href="/admin/finanzas/recibos" className="underline">Volver a Recibos</Link>
      <p>Seleccione uno, varios o todos. Para confirmar el pago en Caja, valide primero el documento de identidad.</p>
      <form action="/admin/finanzas/recibos/emitir" className="card flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">Nombre, apellido o cédula
          <input name="q" type="search" maxLength={120} defaultValue={q} />
        </label>
        <label>Junta de origen
          <input name="junta" placeholder="M12 o F12" maxLength={12} defaultValue={junta} />
        </label>
        <button className="bg-blue-700 px-4 py-2">Buscar</button>
      </form>
      {juntaInvalida ? <p role="alert">Escriba una junta válida, por ejemplo M12 o F12.</p>
        : fichas.length ? (
          <>
            {permitidas.length > fichas.length && <p className="hint">Se muestran las primeras {MAX_RECIBOS_LOTE} fichas. Use los filtros para ver otras.</p>}
            <SeleccionRecibos key={JSON.stringify([q, junta, modo])} fichas={fichas} modo={modo} />
          </>
        ) : <p>No hay fichas activas con esa búsqueda.</p>}
    </main>
  );
}
