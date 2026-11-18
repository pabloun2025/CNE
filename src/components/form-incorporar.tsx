"use client";

import { useState, useTransition } from "react";
import type { JuntaMando } from "@/domain/mando";
import { incorporarVotanteAccion } from "@/server/movimiento-actions";

const campo = "mt-1 w-full rounded border border-slate-400 px-3 py-3 text-base";

// Incorporar un votante como MJRV, uno a uno (09 §3.6). Solo ofrece juntas con cargos vacantes y los cargos vacantes de esa junta.
export function FormIncorporar({ juntas, onCerrar, onCambio }: { juntas: JuntaMando[]; onCerrar: () => void; onCambio: () => void }) {
  const conVacantes = juntas.filter((j) => j.vacantes.length > 0).sort((a, b) => a.vacantes.length - b.vacantes.length || a.serie.localeCompare(b.serie) || a.numero - b.numero);
  const [juntaId, setJuntaId] = useState<number | null>(conVacantes[0]?.id ?? null);
  const [cargo, setCargo] = useState("");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const junta = conVacantes.find((j) => j.id === juntaId) ?? null;
  const cargoValido = junta && junta.vacantes.includes(cargo as JuntaMando["vacantes"][number]) ? cargo : junta?.vacantes[0] ?? "";

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    f.set("juntaId", String(juntaId));
    f.set("cargo", cargoValido);
    iniciar(async () => {
      const r = await incorporarVotanteAccion(f);
      setMensaje({ ok: r.ok, texto: r.ok ? r.mensaje ?? "Incorporado." : r.mensaje });
      if (r.ok) { (e.target as HTMLFormElement).reset?.(); onCambio(); }
    });
  };

  return (
    <div role="dialog" aria-label="Incorporar votante" className="fixed inset-0 z-40 overflow-y-auto bg-white p-4">
      <button onClick={onCerrar} className="mb-3 rounded border border-slate-500 px-4 py-3 font-semibold">Cerrar</button>
      <h2 className="text-2xl font-bold">Incorporar votante</h2>
      <p className="mt-1 text-sm">La persona queda presente desde ya y cubre el cargo que elija. Se crea una ficha nueva (sin credencial).</p>
      {conVacantes.length === 0 ? <p className="mt-3 font-medium">Ninguna junta tiene cargos vacantes.</p> : (
        <form onSubmit={enviar} className="mt-3 grid max-w-md gap-3">
          <label className="text-sm font-medium">Junta
            <select value={juntaId ?? ""} onChange={(e) => setJuntaId(Number(e.target.value))} className={campo}>
              {conVacantes.map((j) => <option key={j.id} value={j.id}>{j.serie}{j.numero} · {j.texto}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Cargo que cubrirá
            <select value={cargoValido} onChange={(e) => setCargo(e.target.value)} className={`${campo} capitalize`}>
              {(junta?.vacantes ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium">Nombres<input name="nombres" required maxLength={120} className={campo} /></label>
          <label className="text-sm font-medium">Apellidos<input name="apellidos" required maxLength={120} className={campo} /></label>
          <label className="text-sm font-medium">Cédula<input name="cedula" required autoComplete="off" className={campo} /></label>
          <label className="text-sm font-medium">Teléfono (opcional)<input name="telefono" inputMode="tel" className={campo} /></label>
          <label className="text-sm font-medium">Correo (opcional)<input name="correo" type="email" className={campo} /></label>
          {mensaje && <p role={mensaje.ok ? "status" : "alert"} className={`font-semibold ${mensaje.ok ? "text-green-800" : "text-red-700"}`}>{mensaje.texto}</p>}
          <button disabled={pendiente || !junta} className="rounded bg-green-700 px-6 py-4 text-lg font-bold text-white disabled:opacity-60">Incorporar</button>
        </form>
      )}
    </div>
  );
}
