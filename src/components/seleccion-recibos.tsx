"use client";

import { useState } from "react";

type Ficha = { id: number; nombre: string; cedula: string; junta: string };

export function SeleccionRecibos({ fichas }: { fichas: Ficha[] }) {
  const [elegidas, cambiar] = useState<number[]>([]);
  const todas = elegidas.length === fichas.length;

  return (
    <form method="post" action="/api/admin/finanzas/recibos/emitir" target="_blank" className="card stack">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="secondary px-3 py-2" onClick={() => cambiar(todas ? [] : fichas.map((f) => f.id))}>
          {todas ? "Quitar selección" : "Seleccionar todas las visibles"}
        </button>
        <p role="status">{elegidas.length} de {fichas.length} seleccionadas</p>
      </div>
      <ul className="max-h-96 overflow-y-auto divide-y">
        {fichas.map((f) => (
          <li key={f.id} className="py-2">
            <label className="flex items-center gap-3">
              <input type="checkbox" name="id" value={f.id} checked={elegidas.includes(f.id)} onChange={(e) => {
                const marcada = e.target.checked;
                cambiar((ids) => marcada ? [...ids, f.id] : ids.filter((id) => id !== f.id));
              }} />
              <span>{f.nombre}<span className="block text-sm">{f.junta} · {f.cedula}</span></span>
            </label>
          </li>
        ))}
      </ul>
      <button disabled={!elegidas.length}>Abrir PDF {elegidas.length > 1 ? "del lote" : "del recibo"}</button>
    </form>
  );
}
