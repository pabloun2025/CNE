"use client";

import { useEffect, useState } from "react";
import { ZONA_HEX, ZONA_NOMBRE, type ZonaColor } from "@/domain/juntas";
import type { JuntaPanorama } from "@/server/verificacion-mesas";

const FILTROS = {
  recorrer: "Por recorrer",
  validar: "Con documentos por validar",
  mjrv: "Del MJRV sin validar",
  validados: "Con documentos validados",
  todas: "Todas",
} as const;
type Filtro = keyof typeof FILTROS;

function coincide(junta: JuntaPanorama, filtro: Filtro) {
  switch (filtro) {
    case "recorrer": return junta.cargosPendientes > 0 || junta.capturaPendiente > 0;
    case "validar": return junta.porValidar > 0;
    case "mjrv": return junta.delMjrv > 0;
    case "validados": return junta.validados > 0;
    case "todas": return true;
  }
}

export function PanoramaJuntas({ inicial, activo, cargar, abrir }: {
  inicial: JuntaPanorama[]; activo: boolean; cargar: (signal: AbortSignal) => Promise<JuntaPanorama[]>;
  abrir: (id: number) => void;
}) {
  const [juntas, setJuntas] = useState(inicial);
  const [filtro, setFiltro] = useState<Filtro>("recorrer");
  const [zona, setZona] = useState<ZonaColor | "">("");
  const [busqueda, setBusqueda] = useState("");
  const [solicitud, actualizar] = useState(0);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    if (!activo) return;
    const controlador = new AbortController();
    let enCurso = false;
    async function cargarPanorama() {
      if (enCurso || document.visibilityState === "hidden") return;
      enCurso = true;
      try {
        const datos = await cargar(controlador.signal);
        if (!controlador.signal.aborted) { setJuntas(datos); setFallo(false); }
      } catch { if (!controlador.signal.aborted) setFallo(true); }
      finally { enCurso = false; }
    }
    void cargarPanorama();
    const intervalo = window.setInterval(cargarPanorama, 15000);
    return () => { controlador.abort(); window.clearInterval(intervalo); };
  }, [activo, cargar, solicitud]);

  const texto = busqueda.trim().toUpperCase().replace(/\s+/g, "");
  const candidatas = juntas.filter((j) => (!zona || j.zona === zona) && j.junta.includes(texto));
  const visibles = candidatas.filter((j) => coincide(j, filtro)).sort((a, b) =>
    b.cargosPendientes - a.cargosPendientes || b.capturaPendiente - a.capturaPendiente);
  const zonas = [...new Set(juntas.map((j) => j.zona))];

  return (
    <div className="space-y-3" hidden={!activo}>
      <section className="card stack">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2>Recorrido por juntas</h2>
          <button type="button" className="button-like secondary" onClick={() => actualizar((n) => n + 1)}>Actualizar</button>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label>Estado
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
              {(Object.keys(FILTROS) as Filtro[]).map((f) => <option key={f} value={f}>{FILTROS[f]} ({candidatas.filter((j) => coincide(j, f)).length})</option>)}
            </select>
          </label>
          <label>Zona de color
            <select value={zona} onChange={(e) => setZona(e.target.value as ZonaColor | "")}>
              <option value="">Todas las zonas</option>
              {zonas.map((z) => <option key={z} value={z}>{ZONA_NOMBRE[z]}</option>)}
            </select>
          </label>
          <label>Buscar junta
            <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="M12 o F8" autoComplete="off" />
          </label>
        </div>
        {fallo && <p role="status">No se pudo actualizar el recorrido. Se muestran los últimos datos disponibles.</p>}
        <p role="status">{visibles.length} {visibles.length === 1 ? "junta" : "juntas"} con estos filtros</p>
      </section>
      {zonas.map((z) => {
        const grupo = visibles.filter((j) => j.zona === z);
        if (!grupo.length) return null;
        return (
          <section key={z} className="card stack">
            <h3 className="flex items-center gap-2">
              <span className="size-3 shrink-0 rounded-full border border-black/20" style={{ backgroundColor: ZONA_HEX[z] }} aria-hidden="true" />
              {ZONA_NOMBRE[z]} · {z === "verde" || z === "rosado" ? "Vial norte" : "Vial este"}
            </h3>
            <ul className="divide-y">
              {grupo.map((j) => (
                <li key={j.id}>
                  <button type="button" onClick={() => abrir(j.id)} aria-label={`Abrir junta ${j.junta}`}
                    className="w-full rounded py-3 text-left shadow-none hover:bg-slate-50">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-semibold">Junta {j.junta}</span>
                      <span className="text-sm font-semibold text-blue-800" aria-hidden="true">Abrir ›</span>
                    </span>
                    <span className="block text-sm">{j.cargosPendientes} cargos por confirmar · {j.capturaPendiente} documentos por completar</span>
                    <span className="block text-sm">{j.porValidar} por validar · {j.delMjrv} del MJRV sin validar · {j.validados} validados</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
