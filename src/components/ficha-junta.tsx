"use client";

import { useState, useTransition } from "react";
import { asignarCargoAccion, excepcionAccion, moverManualAccion, quitarCargoAccion, rehabilitarAccion } from "@/server/movimiento-actions";
import { useSondeo } from "./sondeo";

type Miembro = { id: number; nombre: string; rol: string; origen: string; actual: string; ingresado: boolean; con_excepcion: boolean; no_viable: boolean; incorporado: boolean; cargo: string | null };
type CargoFicha = { cargo: string; mjrvId: number | null; nombre: string | null; tipo: string | null; etiqueta: string | null };
type Detalle = { junta: { id: number; etiqueta: string; zona: string }; miembros: Miembro[]; cargos: CargoFicha[]; sinCargo: { id: number; nombre: string; rol: string }[] };
type Res = { ok: boolean; mensaje?: string; confirmar?: boolean };

export function FichaJunta({ juntaId, onCerrar, onCambio }: { juntaId: number; onCerrar: () => void; onCambio: () => void }) {
  const { datos, refrescar } = useSondeo<Detalle>(`/api/mando/junta?id=${juntaId}`, 3000);
  const [aviso, setAviso] = useState<{ id: number; texto: string; confirmar?: boolean } | null>(null);
  const [destino, setDestino] = useState<Record<number, string>>({});
  const [elegida, setElegida] = useState<Record<string, string>>({}); // cargo → persona a asignar
  const [avisoCargo, setAvisoCargo] = useState("");
  const [pendiente, iniciar] = useTransition();

  const correr = (id: number, accion: (f: FormData) => Promise<Res>, campos: Record<string, string>) =>
    iniciar(async () => {
      const f = new FormData();
      f.set("mjrvId", String(id));
      for (const [k, v] of Object.entries(campos)) f.set(k, v);
      const r = await accion(f);
      setAviso(r.ok ? null : { id, texto: r.mensaje ?? "", confirmar: r.confirmar });
      refrescar();
      onCambio();
    });

  const cambiarCargo = (accion: (f: FormData) => Promise<Res>, campos: Record<string, string>) =>
    iniciar(async () => {
      const f = new FormData();
      f.set("juntaId", String(juntaId));
      for (const [k, v] of Object.entries(campos)) f.set(k, v);
      const r = await accion(f);
      setAvisoCargo(r.ok ? "" : r.mensaje ?? "");
      refrescar();
      onCambio();
    });

  return (
    <div role="dialog" aria-label="Ficha de junta" className="fixed inset-0 z-40 overflow-y-auto bg-white p-4">
      <button onClick={onCerrar} className="mb-3 rounded border border-slate-500 px-4 py-3 font-semibold">Cerrar</button>
      {!datos ? <p>Cargando…</p> : (
        <>
          <h2 className="text-2xl font-bold">Junta {datos.junta.etiqueta}</h2>
          <section aria-label="Cargos" className="mt-2 space-y-2 rounded border p-3">
            <h3 className="font-semibold">Cargos</h3>
            {avisoCargo && <p role="alert" className="text-sm font-semibold text-red-700">{avisoCargo}</p>}
            {datos.cargos.map((c) => (
              <div key={c.cargo} className={`rounded border-l-4 p-2 ${c.mjrvId === null ? "border-amber-600 bg-amber-50" : "border-green-700 bg-green-50"}`}>
                <p className="font-medium capitalize">{c.cargo}: {c.mjrvId === null ? <span className="text-amber-900">VACANTE</span> : <>{c.nombre} <span className="font-normal text-slate-700">· {c.etiqueta}</span></>}</p>
                {c.mjrvId === null && datos.sinCargo.length > 0 && (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <select value={elegida[c.cargo] ?? ""} onChange={(e) => setElegida((s) => ({ ...s, [c.cargo]: e.target.value }))} aria-label={`Quién será ${c.cargo}`} className="min-w-0 rounded border border-slate-400 px-2 py-2">
                      <option value="">Elegir persona presente…</option>
                      {datos.sinCargo.map((p) => <option key={p.id} value={p.id}>{p.nombre} ({p.rol})</option>)}
                    </select>
                    <button disabled={pendiente || !elegida[c.cargo]} onClick={() => cambiarCargo(asignarCargoAccion, { mjrvId: elegida[c.cargo], cargo: c.cargo })} className="rounded bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">Asignar</button>
                  </div>
                )}
                {c.mjrvId !== null && c.tipo !== "titular" && c.tipo !== "suplente_junta" && (
                  <button disabled={pendiente} onClick={() => cambiarCargo(quitarCargoAccion, { mjrvId: String(c.mjrvId) })} className="mt-1 rounded border border-slate-600 px-3 py-2 text-sm font-semibold">Quitar</button>
                )}
              </div>
            ))}
          </section>
          <ul className="mt-2 divide-y">
            {datos.miembros.map((m) => (
              <li key={m.id} className="space-y-2 py-3">
                <p className="font-medium">{m.nombre} <span className="font-normal text-slate-600">· {m.rol}{m.cargo ? ` · hace de ${m.cargo}` : ""}</span></p>
                <p className="text-sm">
                  {m.con_excepcion ? "No disponible" : m.ingresado ? "Llegó" : "No llegó"}
                  {m.origen !== m.actual ? ` · trasladado ${m.origen} → ${m.actual}` : ""}
                  {m.no_viable ? " · marcado «no viable» (fuera de las propuestas)" : ""}
                  {m.incorporado ? " · Incorporada desde votantes" : ""}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input value={destino[m.id] ?? ""} onChange={(e) => setDestino((d) => ({ ...d, [m.id]: e.target.value }))} placeholder="Mover a… (H12)" aria-label={`Destino para ${m.nombre}`} className="w-32 rounded border border-slate-400 px-2 py-2" />
                  <button disabled={pendiente || !(destino[m.id] ?? "").trim()} onClick={() => correr(m.id, moverManualAccion, { destino: destino[m.id] })} className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold disabled:opacity-60">Mover manualmente</button>
                  {m.ingresado && !m.con_excepcion && (
                    <button disabled={pendiente} onClick={() => { const motivo = window.prompt("Motivo por el que no está disponible"); if (motivo) correr(m.id, excepcionAccion, { motivo }); }} className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold">Marcar no disponible</button>
                  )}
                  {m.con_excepcion && <button disabled={pendiente} onClick={() => correr(m.id, excepcionAccion, { quitar: "1" })} className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold">Quitar excepción</button>}
                  {m.no_viable && <button disabled={pendiente} onClick={() => correr(m.id, rehabilitarAccion, {})} className="rounded border border-slate-600 px-3 py-2 text-sm font-semibold">Volver a habilitar</button>}
                </div>
                {aviso?.id === m.id && (
                  <p role="alert" className="text-sm font-semibold text-red-700">
                    {aviso.texto}{" "}
                    {aviso.confirmar && <button disabled={pendiente} onClick={() => correr(m.id, moverManualAccion, { destino: destino[m.id], confirmar: "1" })} className="ml-2 rounded bg-red-700 px-3 py-2 text-white">Confirmar traslado</button>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
