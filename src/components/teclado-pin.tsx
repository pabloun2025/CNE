"use client";

import { useState, useTransition } from "react";
import { entrarEstacionAccion } from "@/server/estacion-actions";

// Elegir nombre y teclear 4 dígitos con teclas grandes; envía solo al completar el cuarto.
export function TecladoPin({ token, operadores }: { token: string; operadores: { id: number; nombre: string; apellido: string }[] }) {
  const [operador, setOperador] = useState<number | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();

  const pulsar = (d: string) => {
    if (pendiente || operador === null || pin.length >= 4) return;
    const nuevo = pin + d;
    setPin(nuevo);
    setError("");
    if (nuevo.length === 4) {
      iniciar(async () => {
        const r = await entrarEstacionAccion(token, operador, nuevo);
        if (r?.error) { setError(r.error); setPin(""); }
      });
    }
  };

  if (operadores.length === 0) return <p className="mt-4">No hay operadores habilitados para esta función. Pida a la administración que los cree.</p>;
  return (
    <div className="mt-4 space-y-4">
      <fieldset>
        <legend className="mb-1 text-sm font-medium">¿Quién es usted?</legend>
        <div className="grid gap-2">
          {operadores.map((o) => (
            <button key={o.id} type="button" onClick={() => { setOperador(o.id); setPin(""); setError(""); }}
              className={`rounded border-2 px-4 py-4 text-left text-lg font-semibold ${operador === o.id ? "border-blue-700 bg-blue-50" : "border-slate-300"}`}>
              {`${o.nombre} ${o.apellido}`.trim()}
            </button>
          ))}
        </div>
      </fieldset>
      {operador !== null && (
        <div>
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
