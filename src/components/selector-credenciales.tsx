"use client";

import { useState } from "react";
import { ZONAS, ZONA_NOMBRE } from "@/domain/juntas";

export type PersonaCredencial = { id: number; nombre: string; rotulo: string };

export function SelectorCredenciales({ personas, imprimir = false }: { personas: PersonaCredencial[]; imprimir?: boolean }) {
  const [alcance, setAlcance] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [elegidas, setElegidas] = useState<number[]>([]);
  const consulta = busqueda.trim().toLocaleLowerCase("es");
  const coincidencias = alcance === "ids"
    ? personas.filter((p) => `${p.nombre} ${p.rotulo}`.toLocaleLowerCase("es").includes(consulta))
    : [];
  const visibles = coincidencias.slice(0, 40);
  return (
    <div className="stack">
      <label>Fichas
        <select name="alcance" value={alcance} onChange={(e) => setAlcance(e.target.value)}>
          <option value="todas">Todas las fichas activas</option>
          {imprimir && <option value="sin_generar">Credenciales sin preparar</option>}
          <option value="junta">Una junta</option>
          <option value="zona">Una zona</option>
          <option value="ids">Seleccionar fichas</option>
        </select>
      </label>
      {alcance === "junta" && <label>Junta<input name="valor" placeholder="H12" required maxLength={8} /></label>}
      {alcance === "zona" && <label>Zona<select name="valor" defaultValue="" required>
        <option value="" disabled>Seleccione una zona</option>
        {ZONAS.map((zona) => <option key={zona} value={zona}>{ZONA_NOMBRE[zona]}</option>)}
      </select></label>}
      {alcance === "ids" && (
        <fieldset className="stack">
          <legend>Selección manual</legend>
          {elegidas.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
          <label>Buscar por nombre o rótulo<input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></label>
          <div className="flex flex-wrap items-center gap-3">
            <p role="status">{elegidas.length} seleccionadas</p>
            {elegidas.length > 0 && <button type="button" className="quiet" onClick={() => setElegidas([])}>Quitar selección</button>}
          </div>
          {visibles.length > 0
            ? <ul className="max-h-64 overflow-y-auto divide-y">
              {visibles.map((p) => (
                <li key={p.id} className="py-2">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" checked={elegidas.includes(p.id)} onChange={(e) => {
                      const marcada = e.target.checked;
                      setElegidas((ids) => marcada ? [...ids, p.id] : ids.filter((id) => id !== p.id));
                    }} />
                    <span>{p.nombre} · {p.rotulo}</span>
                  </label>
                </li>
              ))}
            </ul>
            : <p>No hay fichas con rótulo que coincidan.</p>}
          {coincidencias.length > visibles.length && <p className="hint">Se muestran las primeras {visibles.length} coincidencias. Use la búsqueda para ver las demás.</p>}
        </fieldset>
      )}
    </div>
  );
}
