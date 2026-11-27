"use client";

import { useEffect, useState } from "react";
import { ZONA_HEX, ZONA_NOMBRE, type ZonaColor } from "@/domain/juntas";
import type { JuntaPanorama } from "@/server/verificacion-mesas";

const PRINCIPALES = { recorrer: "Por recorrer", validar: "Por validar", validados: "Validados" } as const;
const ADICIONALES = { cargos: "Cargos pendientes", captura: "Fotos pendientes", mjrv: "Del MJRV sin validar", ausentes: "Con ausencias", todas: "Todas las juntas" } as const;
const FILTROS = { ...PRINCIPALES, ...ADICIONALES };
type Filtro = keyof typeof FILTROS;
export type FiltroDocumentosMesa = "todos" | "captura" | "mjrv" | "por_validar" | "validado";
const DOCUMENTALES: Partial<Record<Filtro, FiltroDocumentosMesa>> = {
  validar: "por_validar", captura: "captura", mjrv: "mjrv", validados: "validado",
};

function coincide(junta: JuntaPanorama, filtro: Filtro) {
  switch (filtro) {
    case "recorrer": return junta.cargosPendientes > 0 || junta.capturaPendiente > 0;
    case "cargos": return junta.cargosPendientes > 0;
    case "captura": return junta.capturaPendiente > 0;
    case "validar": return junta.porValidar > 0;
    case "mjrv": return junta.delMjrv > 0;
    case "validados": return junta.validados > 0;
    case "ausentes": return junta.ausentes > 0;
    case "todas": return true;
  }
}

function EstadoJunta({ junta, filtro }: { junta: JuntaPanorama; filtro: Filtro }) {
  if (filtro === "validar") return <span>{junta.porValidar} por validar</span>;
  if (filtro === "mjrv") return <span>{junta.delMjrv} del MJRV</span>;
  if (filtro === "validados") return <span className="text-[var(--ok)]">{junta.validados} validados</span>;
  if (filtro === "ausentes") return <span className="text-[var(--bad)]">{junta.ausentes} {junta.ausentes === 1 ? "ausencia" : "ausencias"}</span>;
  if (filtro === "cargos") return <span>{junta.cargosPendientes} {junta.cargosPendientes === 1 ? "cargo pendiente" : "cargos pendientes"}</span>;
  if (filtro === "captura") return <span>{junta.capturaPendiente} {junta.capturaPendiente === 1 ? "ficha sin fotos completas" : "fichas sin fotos completas"}</span>;
  const pendientes = [
    junta.cargosPendientes ? `${junta.cargosPendientes} ${junta.cargosPendientes === 1 ? "cargo" : "cargos"} por confirmar` : "",
    junta.capturaPendiente ? `${junta.capturaPendiente} con fotos pendientes` : "",
  ].filter(Boolean);
  return pendientes.length ? <span>{pendientes.join(" · ")}</span> : <span className="text-[var(--ok)]">Recorrido completo</span>;
}

export function PanoramaJuntas({ inicial, activo, cargar, abrir }: {
  inicial: JuntaPanorama[]; activo: boolean; cargar: (signal: AbortSignal) => Promise<JuntaPanorama[]>;
  abrir: (id: number, documentos?: FiltroDocumentosMesa) => void;
}) {
  const [juntas, setJuntas] = useState(inicial);
  const [filtro, setFiltro] = useState<Filtro>("recorrer");
  const [zona, setZona] = useState<ZonaColor | "">("");
  const [busqueda, setBusqueda] = useState("");
  const [mas, setMas] = useState(false);
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
  const candidatas = juntas.filter((j) => (!zona || j.zona === zona)
    && (!texto || j.junta.startsWith(texto) || j.junta.slice(1).startsWith(texto)));
  const visibles = candidatas.filter((j) => coincide(j, filtro));
  const zonas = [...new Set(juntas.map((j) => j.zona))];
  const adicional = Object.hasOwn(ADICIONALES, filtro);
  const contar = (opcion: Filtro) => candidatas.filter((j) => coincide(j, opcion)).length;

  return (
    <div className="space-y-3" hidden={!activo}>
      <section className="card grid gap-3 !p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2">
          <h2>Recorrido por juntas</h2>
          <button type="button" className="min-h-11 text-sm font-semibold text-[var(--blue)]" onClick={() => actualizar((n) => n + 1)}>Actualizar</button>
        </div>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Estado de las juntas">
          {(Object.keys(PRINCIPALES) as (keyof typeof PRINCIPALES)[]).map((opcion) => (
            <button key={opcion} type="button" aria-pressed={filtro === opcion} onClick={() => { setFiltro(opcion); setMas(false); }}
              className="flex min-h-[4rem] flex-col items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--blue-wash)] px-1 py-1.5 text-xs font-semibold text-[var(--navy)] aria-pressed:border-[var(--navy)] aria-pressed:bg-[var(--navy)] aria-pressed:text-white sm:text-sm">
              {PRINCIPALES[opcion]} <span className="text-xl leading-tight tabular-nums">{contar(opcion)}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="field min-w-0">Zona
            <select value={zona} onChange={(e) => setZona(e.target.value as ZonaColor | "")}>
              <option value="">Todas</option>
              {zonas.map((z) => <option key={z} value={z}>{ZONA_NOMBRE[z]}</option>)}
            </select>
          </label>
          <label className="field min-w-0">Buscar junta
            <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="M12 o F8" autoComplete="off" />
          </label>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p role="status" className="text-sm text-[var(--text-2)]">{visibles.length} {visibles.length === 1 ? "junta" : "juntas"}</p>
          <button type="button" aria-expanded={mas} aria-controls="filtros-recorrido" onClick={() => setMas(!mas)}
            className="min-h-11 rounded-lg px-2 text-sm font-semibold text-[var(--blue)]">
            {adicional ? FILTROS[filtro] : "Más filtros"} <span aria-hidden="true">{mas ? "▴" : "▾"}</span>
          </button>
        </div>
        <div id="filtros-recorrido" hidden={!mas}>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(ADICIONALES) as (keyof typeof ADICIONALES)[]).map((opcion) => (
              <button key={opcion} type="button" aria-pressed={filtro === opcion} onClick={() => { setFiltro(opcion); setMas(false); }}
                className="min-h-11 rounded-lg border border-[var(--line)] px-2 py-1 text-left text-sm font-semibold text-[var(--navy)] aria-pressed:border-[var(--navy)] aria-pressed:bg-[var(--blue-soft)]">
                {ADICIONALES[opcion]} <span className="whitespace-nowrap">({contar(opcion)})</span>
              </button>
            ))}
          </div>
        </div>
        {fallo && <p role="status" className="text-sm text-[var(--bad)]">Se muestran los últimos datos. Pulse Actualizar para reintentar.</p>}
      </section>
      {!visibles.length && <p className="empty">No hay juntas con estos filtros.</p>}
      {zonas.map((z) => {
        const grupo = visibles.filter((j) => j.zona === z);
        if (!grupo.length) return null;
        return (
          <section key={z} className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
            <h3 className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--blue-wash)] px-3 py-2.5 !text-sm">
              <span className="size-3 shrink-0 rounded-full border border-black/20" style={{ backgroundColor: ZONA_HEX[z] }} aria-hidden="true" />
              {ZONA_NOMBRE[z]} · {z === "verde" || z === "rosado" ? "Vial norte" : "Vial este"}
            </h3>
            <ul className="divide-y divide-[var(--line)]">
              {grupo.map((j) => (
                <li key={j.id}>
                  <button type="button" onClick={() => abrir(j.id, DOCUMENTALES[filtro])} aria-label={`Abrir junta ${j.junta}`}
                    aria-describedby={`estado-recorrido-${j.id}`}
                    className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--blue-wash)]">
                    <strong className="w-11 shrink-0 text-lg text-[var(--navy)]">{j.junta}</strong>
                    <span id={`estado-recorrido-${j.id}`} className="flex-1 text-sm text-[var(--text-2)]"><EstadoJunta junta={j} filtro={filtro} /></span>
                    <span className="ml-auto text-xl leading-none text-[var(--blue)]" aria-hidden="true">›</span>
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
