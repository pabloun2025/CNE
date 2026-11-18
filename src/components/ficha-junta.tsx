"use client";

import { useState, useTransition } from "react";
import { excepcionAccion, moverManualAccion, rehabilitarAccion } from "@/server/movimiento-actions";
import { useSondeo } from "./sondeo";

type Miembro = { id: number; nombre: string; rol: string; origen: string; actual: string; ingresado: boolean; con_excepcion: boolean; no_viable: boolean };
type Detalle = { junta: { id: number; etiqueta: string; zona: string }; miembros: Miembro[] };
type Res = { ok: boolean; mensaje?: string; confirmar?: boolean };

export function FichaJunta({ juntaId, onCerrar, onCambio }: { juntaId: number; onCerrar: () => void; onCambio: () => void }) {
  const { datos, refrescar } = useSondeo<Detalle>(`/api/mando/junta?id=${juntaId}`, 3000);
  const [aviso, setAviso] = useState<{ id: number; texto: string; confirmar?: boolean } | null>(null);
  const [destino, setDestino] = useState<Record<number, string>>({});
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

  return (
    <div role="dialog" aria-label="Ficha de junta" className="fixed inset-0 z-40 overflow-y-auto bg-white p-4">
      <button onClick={onCerrar} className="mb-3 rounded border border-slate-500 px-4 py-3 font-semibold">Cerrar</button>
      {!datos ? <p>Cargando…</p> : (
        <>
          <h2 className="text-2xl font-bold">Junta {datos.junta.etiqueta}</h2>
          <ul className="mt-2 divide-y">
            {datos.miembros.map((m) => (
              <li key={m.id} className="space-y-2 py-3">
                <p className="font-medium">{m.nombre} <span className="font-normal text-slate-600">· {m.rol}</span></p>
                <p className="text-sm">
                  {m.con_excepcion ? "No disponible" : m.ingresado ? "Llegó" : "No llegó"}
                  {m.origen !== m.actual ? ` · trasladado ${m.origen} → ${m.actual}` : ""}
                  {m.no_viable ? " · marcado «no viable» (fuera de las propuestas)" : ""}
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
