"use client";

import { useState } from "react";
import type { FilaFinanzas, ResumenFinanzas } from "@/server/finanzas-resumen";
import { corregirNombresAccion, validarCedulaAccion } from "@/server/finanzas-nombres-actions";
import { horaCorta, useSondeo } from "./sondeo";

const ESTADO: Record<string, string> = { pagada: "Pagada", acta_preparada: "Acta preparada", lista: "Lista", documentacion_incompleta: "Documentación incompleta" };
const hora = (t: string) => new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

// Sondeo de 5 s. Refleja confirmaciones efectivas, no actas impresas.
export function PanelFinanciero() {
  const { datos, ultima, falla, refrescar } = useSondeo<ResumenFinanzas>("/api/admin/finanzas/resumen", 5000);
  const [filtro, setFiltro] = useState("");
  const [q, setQ] = useState("");
  const [soloSinValidar, setSoloSinValidar] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [apellidos, setApellidos] = useState("");
  const [nombres, setNombres] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [seleccion, setSeleccion] = useState<{ modoPrueba: boolean; ids: number[] } | null>(null);
  if (!datos) return <p>{falla ? "No se pudo cargar el panel. Reintentando…" : "Cargando…"}</p>;
  const filas = datos.filas.filter((f) => (!filtro || f.estado === filtro) && (!soloSinValidar || !f.cedulaValidada) && (!q.trim() || `${f.nombre} ${f.cedula}`.toLowerCase().includes(q.trim().toLowerCase())));
  const elegibles = filas.filter((f) => f.estado !== "pagada");
  const ids = seleccion?.modoPrueba === datos.modoPrueba ? seleccion.ids : [];
  const elegidas = elegibles.filter((f) => ids.includes(f.id));
  const elegir = (nuevos: number[]) => setSeleccion({ modoPrueba: datos.modoPrueba, ids: nuevos });
  const guardarNombre = async (id: number) => {
    setOcupado(true);
    const f = new FormData();
    f.set("id", String(id)); f.set("apellidos", apellidos); f.set("nombres", nombres);
    const r = await corregirNombresAccion(f);
    setAviso(r.ok ? "Nombre guardado." : r.mensaje ?? "No se pudo guardar.");
    if (r.ok) setEditando(null);
    setOcupado(false);
    refrescar();
  };
  const validar = async (id: number) => {
    setOcupado(true);
    const f = new FormData();
    f.set("id", String(id));
    const r = await validarCedulaAccion(f);
    setAviso(r.ok ? "Cédula validada." : r.mensaje ?? "No se pudo validar.");
    setOcupado(false);
    refrescar();
  };
  return (
    <div className="space-y-3">
      {datos.pagosSinImporteEur > 0 && <p role="status">Pagos confirmados sin importe EUR registrado: {datos.pagosSinImporteEur}. El total solo incluye importes conocidos.</p>}
      {datos.modoPrueba && <p className="border-2 border-stone-900 bg-stone-100 p-2 text-sm font-semibold">Modo prueba: los pagos y los importes son simulados.</p>}
      <div className="home-cards">
        {[["Pagados", datos.pagados], ["Pendientes", datos.pendientes], ["Documentación incompleta", datos.documentacionIncompleta], ["Sin cédula validada", datos.sinCedulaValidada], ["Total entregado EUR", datos.totalEur]].map(([t, v]) => (
          <article key={String(t)} className="home-card stat"><h3>{t}</h3><p className="stat-figure">{v}</p></article>
        ))}
      </div>
      <p className={`text-xs ${falla ? "font-bold text-red-700" : "text-slate-600"}`}>{falla ? `Sin actualizar desde ${ultima ? horaCorta(ultima) : "—"}` : `Actualizado ${ultima ? horaCorta(ultima) : ""}`}</p>
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Apellidos o cédula" aria-label="Apellidos o cédula" className="px-2 py-2" />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Estado" className="px-2 py-2">
          <option value="">Todos los estados</option>{Object.entries(ESTADO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-2 px-2 py-2 text-sm font-medium"><input type="checkbox" checked={soloSinValidar} onChange={(e) => setSoloSinValidar(e.target.checked)} /> Solo sin cédula validada</label>
      </div>
      {aviso && <p role="status" className="font-semibold">{aviso}</p>}
      {!!elegibles.length && (
        <form method="post" action="/api/admin/finanzas/recibos/emitir" target="_blank" className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="modo" value={datos.modoPrueba ? "prueba" : "eleccion"} />
          {elegidas.map((f) => <input key={f.id} type="hidden" name="id" value={f.id} />)}
          <label className="flex items-center gap-2"><input type="checkbox" checked={elegidas.length === elegibles.length}
            onChange={(e) => elegir(e.target.checked ? elegibles.map((f) => f.id) : [])} /> Seleccionar todos los pendientes del filtro</label>
          <p role="status">{elegidas.length} seleccionadas</p>
          <button className="secondary" disabled={!elegidas.length || falla}>Imprimir en contingencia</button>
        </form>
      )}
      {filas.length === 0 ? <p className="empty">No hay personas con ese criterio.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b"><th scope="col"><span className="sr-only">Selección</span></th><th className="p-2">Persona</th><th className="p-2">Junta</th><th className="p-2">Estado</th><th className="p-2">EUR</th><th className="p-2">Hora y operador</th></tr></thead>
            <tbody>{filas.map((f) => (
              <tr key={f.id} className="border-b">
                <td className="p-2">{f.estado !== "pagada" && <input type="checkbox" aria-label={`Seleccionar a ${f.nombre}`} checked={ids.includes(f.id)}
                  onChange={(e) => elegir(e.target.checked ? [...ids, f.id] : ids.filter((id) => id !== f.id))} />}</td>
                <td className="p-2"><PersonaFila f={f} editando={editando === f.id} apellidos={apellidos} nombres={nombres} ocupado={ocupado} onApellidos={setApellidos} onNombres={setNombres} onEditar={() => { setEditando(f.id); setApellidos(f.apellidos); setNombres(f.nombres); setAviso(""); }} onCancelar={() => setEditando(null)} onGuardar={() => void guardarNombre(f.id)} onValidar={() => void validar(f.id)} /></td>
                <td className="p-2">{f.junta}</td>
                <td className="p-2">{ESTADO[f.estado]}{f.simulado ? " (simulado)" : ""}</td>
                <td className="cifra p-2">{f.eur ?? "—"}</td>
                <td className="p-2">{f.hora ? `${hora(f.hora)} · ${f.operador}` : "—"}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PersonaFila({ f, editando, apellidos, nombres, ocupado, onApellidos, onNombres, onEditar, onCancelar, onGuardar, onValidar }: {
  f: FilaFinanzas; editando: boolean; apellidos: string; nombres: string; ocupado: boolean;
  onApellidos: (v: string) => void; onNombres: (v: string) => void;
  onEditar: () => void; onCancelar: () => void; onGuardar: () => void; onValidar: () => void;
}) {
  return (
    <div className="space-y-1">
      {editando ? (
        <div className="space-y-1">
          <input value={apellidos} onChange={(e) => onApellidos(e.target.value)} aria-label="Apellidos" className="w-full px-2 py-1" />
          <input value={nombres} onChange={(e) => onNombres(e.target.value)} aria-label="Nombres" className="w-full px-2 py-1" />
          <div className="flex gap-2">
            <button type="button" disabled={ocupado} onClick={onGuardar} className="bg-stone-900 px-2 py-1 text-white disabled:opacity-60">Guardar</button>
            <button type="button" disabled={ocupado} onClick={onCancelar} className="border border-stone-900 px-2 py-1">Cancelar</button>
          </div>
        </div>
      ) : (
        <>
          <div>{f.nombre}</div>
          <div className="text-slate-600">{f.cedula}</div>
          <p className={f.cedulaValidada ? "text-green-800" : "font-semibold text-red-700"}>{f.cedulaValidada ? "Cédula validada" : f.fotosCompletas ? "Cédula sin validar" : "Cédula sin validar · faltan fotos"}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onEditar} className="border border-stone-900 px-2 py-1">Corregir nombre</button>
            {!f.cedulaValidada && <button type="button" disabled={ocupado || !f.fotosCompletas} onClick={onValidar} className="border border-stone-900 px-2 py-1 disabled:opacity-50">Validar cédula</button>}
          </div>
        </>
      )}
    </div>
  );
}
