"use client";

import { useState } from "react";
import { ZONAS, ZONA_NOMBRE } from "@/domain/juntas";
import { normalizarFrase } from "@/domain/limpieza";
import type { PersonaCredencial } from "@/server/credenciales";

export function SelectorCredenciales({ personas, elegidas, cambiar }: {
  personas: PersonaCredencial[];
  elegidas: Set<number>;
  cambiar: (ids: Set<number>) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [serie, setSerie] = useState("");
  const [junta, setJunta] = useState("");
  const [zona, setZona] = useState("");
  const [pendientes, setPendientes] = useState(false);
  const consulta = normalizarFrase(busqueda);
  const juntas = [...new Set(personas.filter((p) => !serie || p.junta.startsWith(serie)).map((p) => p.junta))];
  const coincidencias = personas.filter((p) => (!serie || p.junta.startsWith(serie)) && (!junta || p.junta === junta) && (!zona || p.zona === zona)
    && (!pendientes || p.sinPreparar) && normalizarFrase(`${p.nombre} ${p.rotulo}`).includes(consulta));
  const fueraDelFiltro = elegidas.size - coincidencias.filter((p) => elegidas.has(p.id)).length;
  return (
    <fieldset className="stack">
      <legend>Seleccione las credenciales</legend>
      <label>Buscar por nombre o rótulo
        <input className="w-full" type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} />
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label>Serie<select className="w-full" value={serie} onChange={(e) => { setSerie(e.target.value); setJunta(""); }}>
          <option value="">Todas</option>
          <option value="M">M · Masculino</option>
          <option value="F">F · Femenino</option>
        </select></label>
        <label>Junta<select className="w-full" value={junta} onChange={(e) => setJunta(e.target.value)}>
          <option value="">Todas</option>
          {juntas.map((j) => <option key={j}>{j}</option>)}
        </select></label>
        <label>Zona<select className="w-full" value={zona} onChange={(e) => setZona(e.target.value)}>
          <option value="">Todas</option>
          {ZONAS.map((z) => <option key={z} value={z}>{ZONA_NOMBRE[z]}</option>)}
        </select></label>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={pendientes} onChange={(e) => setPendientes(e.target.checked)} /> Solo credenciales sin preparar
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="secondary" disabled={!coincidencias.length} onClick={() => cambiar(new Set(coincidencias.map((p) => p.id)))}>Seleccionar todas las coincidencias</button>
        <button type="button" className="quiet" disabled={!elegidas.size} onClick={() => cambiar(new Set())}>Quitar selección</button>
      </div>
      <p role="status">{coincidencias.length} {coincidencias.length === 1 ? "coincidencia" : "coincidencias"} · {elegidas.size} {elegidas.size === 1 ? "seleccionada" : "seleccionadas"}{fueraDelFiltro > 0 && ` (${fueraDelFiltro} fuera del filtro)`}</p>
      {coincidencias.length ? (
        <ul className="max-h-72 overflow-y-auto divide-y">
          {coincidencias.map((p) => (
            <li key={p.id} className="py-2">
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={elegidas.has(p.id)} onChange={(e) => {
                  const ids = new Set(elegidas);
                  if (e.target.checked) ids.add(p.id);
                  else ids.delete(p.id);
                  cambiar(ids);
                }} />
                <span>{p.nombre} · {p.rotulo}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : <p>No hay fichas con rótulo que coincidan.</p>}
    </fieldset>
  );
}
