"use client";

import { useState, useTransition } from "react";
import { aceptarAccion, noViableAccion, pasarAccion } from "@/server/movimiento-actions";
import type { Propuesta } from "@/domain/propuestas";
import { ZONA_NOMBRE } from "@/domain/juntas";
import { useSondeo } from "./sondeo";

const MOTIVOS = ["No responde", "Se niega", "No está", "Otro"];

// Una propuesta a la vez. Las acciones las decide siempre una persona (§7.3); la tarjeta nunca mueve a nadie sola.
export function TarjetaPropuesta({ onCambio }: { onCambio: () => void }) {
  const { datos, refrescar } = useSondeo<{ propuesta: Propuesta | null }>("/api/mando/propuesta", 3000);
  const [aviso, setAviso] = useState("");
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [otro, setOtro] = useState("");
  const [verNoViable, setVerNoViable] = useState(false);
  const [pendiente, iniciar] = useTransition();
  if (!datos) return null;
  const p = datos.propuesta;
  const datosForm = (extra: Record<string, string> = {}) => {
    const f = new FormData();
    f.set("mjrvId", String(p!.mjrvId)); f.set("origenId", String(p!.origenId)); f.set("destinoId", String(p!.destinoId));
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    return f;
  };
  const ejecutar = (accion: (f: FormData) => Promise<{ ok: boolean; mensaje?: string }>, extra?: Record<string, string>) =>
    iniciar(async () => {
      const r = await accion(datosForm(extra));
      setAviso(r.ok ? "" : r.mensaje ?? "");
      setVerNoViable(false);
      refrescar();
      onCambio();
    });
  if (!p) return <p className="rounded border bg-slate-50 p-3">No hay suplentes transferibles para las juntas incompletas.</p>;
  return (
    <section className="sticky top-8 z-30 space-y-2 rounded border-2 border-blue-700 bg-blue-50 p-3 shadow" aria-label="Propuesta de traslado">
      <p className="text-lg">
        Trasladar a <strong>{p.persona}</strong> (suplente, {p.origen} {ZONA_NOMBRE[p.origenZona]}) → <strong>{p.destino} {ZONA_NOMBRE[p.destinoZona]}</strong>.
      </p>
      <p className="text-sm">Motivo: {p.motivo}{p.mismaZona ? " Misma zona." : ""}</p>
      {aviso && <p role="alert" className="font-semibold text-red-700">{aviso}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={pendiente} onClick={() => ejecutar(aceptarAccion)} className="rounded bg-green-700 px-6 py-4 text-lg font-bold text-white disabled:opacity-60">Aceptar</button>
        <button disabled={pendiente} onClick={() => ejecutar(pasarAccion)} className="rounded border-2 border-slate-600 px-6 py-4 text-lg font-bold disabled:opacity-60">Siguiente propuesta</button>
        <button disabled={pendiente} onClick={() => setVerNoViable((v) => !v)} className="rounded border-2 border-red-700 px-6 py-4 text-lg font-bold text-red-800 disabled:opacity-60">No viable</button>
      </div>
      {verNoViable && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-medium">Motivo
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="mt-1 block rounded border border-slate-400 px-3 py-3">{MOTIVOS.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
          {motivo === "Otro" && <input value={otro} onChange={(e) => setOtro(e.target.value)} placeholder="Escriba el motivo" className="rounded border border-slate-400 px-3 py-3" />}
          <button disabled={pendiente || (motivo === "Otro" && otro.trim().length < 2)} onClick={() => ejecutar(noViableAccion, { motivo: motivo === "Otro" ? otro : motivo })} className="rounded bg-red-700 px-4 py-3 font-bold text-white disabled:opacity-60">Confirmar no viable</button>
        </div>
      )}
    </section>
  );
}
