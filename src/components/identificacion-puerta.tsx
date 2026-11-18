"use client";

import { useState, useTransition } from "react";
import { entrarPuertaAccion } from "@/server/estacion-actions";

const campo = "mt-1 w-full rounded border border-slate-400 px-3 py-3 text-lg";

// Antes de leer el QR: nombre, apellido y PIN, contrastados con la lista del administrador.
export function IdentificacionPuerta({ token }: { token: string }) {
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  const listo = nombre.trim().length >= 2 && apellido.trim().length >= 2;

  const pulsar = (d: string) => {
    if (pendiente || !listo || pin.length >= 4) return;
    const nuevo = pin + d;
    setPin(nuevo);
    setError("");
    if (nuevo.length === 4) {
      iniciar(async () => {
        const r = await entrarPuertaAccion(token, nombre, apellido, nuevo);
        if (r?.error) { setError(r.error); setPin(""); }
      });
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <label className="block text-sm font-medium">Nombre
        <input value={nombre} onChange={(e) => { setNombre(e.target.value); setPin(""); setError(""); }} autoComplete="given-name" className={campo} />
      </label>
      <label className="block text-sm font-medium">Apellido
        <input value={apellido} onChange={(e) => { setApellido(e.target.value); setPin(""); setError(""); }} autoComplete="family-name" className={campo} />
      </label>
      {listo && (
        <div>
          <p className="mb-2 text-center text-sm font-medium">PIN</p>
          <p className="mb-2 text-center text-3xl tracking-[0.5em]" aria-label="PIN">{"●".repeat(pin.length).padEnd(4, "○")}</p>
          <div className="mx-auto grid max-w-xs grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} type="button" onClick={() => pulsar(d)} className="rounded bg-slate-200 py-5 text-2xl font-bold">{d}</button>)}
            <button type="button" onClick={() => setPin("")} className="rounded bg-slate-100 py-5 text-lg font-semibold">Borrar</button>
            <button type="button" onClick={() => pulsar("0")} className="rounded bg-slate-200 py-5 text-2xl font-bold">0</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-center font-medium text-red-700">{error}</p>}
    </div>
  );
}
