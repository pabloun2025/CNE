"use client";

import { useSondeo } from "./sondeo";

type Miembro = { id: number; nombre: string; rol: string; origen: string; actual: string; ingresado: boolean; con_excepcion: boolean };
type Detalle = { junta: { id: number; etiqueta: string; zona: string }; miembros: Miembro[] };

export function FichaJunta({ juntaId, onCerrar }: { juntaId: number; onCerrar: () => void; onCambio: () => void }) {
  const { datos } = useSondeo<Detalle>(`/api/mando/junta?id=${juntaId}`, 3000);
  return (
    <div role="dialog" aria-label="Ficha de junta" className="fixed inset-0 z-40 overflow-y-auto bg-white p-4">
      <button onClick={onCerrar} className="mb-3 rounded border border-slate-500 px-4 py-3 font-semibold">Cerrar</button>
      {!datos ? <p>Cargando…</p> : (
        <>
          <h2 className="text-2xl font-bold">Junta {datos.junta.etiqueta}</h2>
          <ul className="mt-2 divide-y">
            {datos.miembros.map((m) => (
              <li key={m.id} className="py-2">
                <p className="font-medium">{m.nombre} <span className="font-normal text-slate-600">· {m.rol}</span></p>
                <p className="text-sm">{m.con_excepcion ? "No disponible" : m.ingresado ? "Llegó" : "No llegó"}{m.origen !== m.actual ? ` · trasladado ${m.origen} → ${m.actual}` : ""}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
