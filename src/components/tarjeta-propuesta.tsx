"use client";

import { useState, useTransition } from "react";
import { aceptarAccion, noViableAccion, pasarAccion } from "@/server/movimiento-actions";
import type { Propuesta } from "@/domain/propuestas";
import { ZONA_NOMBRE } from "@/domain/juntas";
import { useSondeo } from "./sondeo";

const MOTIVOS = ["No contesta", "No quiere", "Ya no está"];

// Una propuesta a la vez. Las acciones las decide siempre una persona (§7.3); la tarjeta nunca mueve a nadie sola.
export function TarjetaPropuesta({ onCambio }: { onCambio: () => void }) {
  const { datos, refrescar } = useSondeo<{ propuesta: Propuesta | null; juntasConVacantes: number }>("/api/mando/propuesta", 3000);
  const [cargoElegido, setCargoElegido] = useState<{ clave: string; cargo: string } | null>(null);
  const [aviso, setAviso] = useState("");
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [verNoViable, setVerNoViable] = useState(false);
  const [pendiente, iniciar] = useTransition();
  if (!datos) return null;
  const p = datos.propuesta;
  // El cargo propuesto (primera vacante) se puede cambiar por otra vacante del mismo destino; al cambiar de propuesta vuelve el sugerido.
  const clave = p ? `${p.mjrvId}:${p.destinoId}` : "";
  const cargoActual = p ? (cargoElegido?.clave === clave && p.vacantes.includes(cargoElegido.cargo as Propuesta["cargo"]) ? cargoElegido.cargo : p.cargo) : "";
  const datosForm = (extra: Record<string, string> = {}) => {
    const f = new FormData();
    f.set("mjrvId", String(p!.mjrvId)); f.set("origenId", String(p!.origenId)); f.set("destinoId", String(p!.destinoId));
    f.set("cargo", cargoActual);
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
  if (!p) {
    return datos.juntasConVacantes > 0
      ? <p className="border-2 border-amber-700 bg-amber-50 p-3 font-semibold text-amber-950">No hay suplentes transferibles. Si hace falta, incorpore un votante.</p>
      : <p className="border-2 border-stone-900 p-3">No hay juntas con cargos vacantes que cubrir.</p>;
  }
  return (
    <section className="propuesta" aria-label="Propuesta de traslado">
      <p className="text-lg">
        Trasladar a <strong>{p.persona}</strong> (suplente, {p.origen} {ZONA_NOMBRE[p.origenZona]}) → <strong>{p.destino} {ZONA_NOMBRE[p.destinoZona]}</strong>.
      </p>
      <label className="block text-sm font-medium">Cargo que asumirá en {p.destino}
        <select value={cargoActual} onChange={(e) => setCargoElegido({ clave, cargo: e.target.value })} className="mt-1 block w-full capitalize">
          {p.vacantes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <p className="text-sm">Motivo: {p.motivo}{p.mismaZona ? " Misma zona." : ""}</p>
      {aviso && <p role="alert" className="font-semibold text-red-700">{aviso}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={pendiente} onClick={() => ejecutar(aceptarAccion)} className="bg-green-800 px-5 py-4 text-lg text-white disabled:opacity-60">Aceptar</button>
        <button disabled={pendiente} onClick={() => ejecutar(pasarAccion)} className="border-2 border-stone-900 px-5 py-4 text-lg disabled:opacity-60">Siguiente</button>
        <button disabled={pendiente} onClick={() => setVerNoViable((v) => !v)} className="border-2 border-red-800 px-5 py-4 text-lg text-red-800 disabled:opacity-60">No se puede</button>
      </div>
      {verNoViable && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-medium">Motivo
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="mt-1 block">{MOTIVOS.map((m) => <option key={m}>{m}</option>)}</select>
          </label>
          <p className="text-sm">{motivo === "No quiere" ? "Desiste: no se propone para ningún hueco." : "No se propone para este hueco y suelta el asiento."}</p>
          <button disabled={pendiente} onClick={() => ejecutar(noViableAccion, { motivo })} className="bg-red-800 px-4 py-3 text-white disabled:opacity-60">Confirmar</button>
        </div>
      )}
    </section>
  );
}
