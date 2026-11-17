"use client";

import { useState } from "react";
import { CapturaCedula } from "@/components/captura-cedula";
import { LectorQr } from "@/components/lector-qr";

type Ficha = { mjrvId: number; nombre: string; cedula: string; junta: string; anverso: boolean; reverso: boolean; completos: boolean };

// Estación de documentación (y «Capturar ahora» de finanzas): ve el nombre completo y puede sustituir fotos.
export function Documentacion({ inicial }: { inicial?: string }) {
  const [cedula, setCedula] = useState(inicial ?? "");
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [lado, setLado] = useState<"anverso" | "reverso" | null>(null);
  const [mensaje, setMensaje] = useState("");

  const buscar = async (c: string) => {
    setMensaje("");
    try {
      const r = await fetch("/api/e/documentacion/buscar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cedula: c }) });
      const d = await r.json();
      if (!r.ok) setMensaje("No se pudo consultar. Revise la conexión.");
      else if (!d.encontrada) { setFicha(null); setMensaje("No encontramos esa cédula."); }
      else setFicha(d);
    } catch { setMensaje("No hay conexión."); }
  };
  const subir = async (imagen: Blob) => {
    if (!ficha || !lado) return;
    const f = new FormData();
    f.set("lado", lado); f.set("mjrvId", String(ficha.mjrvId)); f.set("imagen", new File([imagen], `${lado}.jpg`, { type: "image/jpeg" }));
    try {
      const r = await fetch("/api/e/documentacion/foto", { method: "POST", body: f });
      const d = await r.json();
      if (!r.ok) { setMensaje(d.error ?? "No se pudo guardar."); return; }
      setFicha({ ...ficha, anverso: d.anverso, reverso: d.reverso, completos: d.completos });
      setLado(null); setMensaje("");
    } catch { setMensaje("No hay conexión."); }
  };

  if (ficha && lado) return (<div className="mx-auto max-w-md space-y-3"><button onClick={() => setLado(null)} className="rounded border border-slate-500 px-4 py-2">← Volver</button><CapturaCedula rotulo={lado === "anverso" ? "Anverso" : "Reverso"} onUsar={subir} />{mensaje && <p role="alert" className="font-semibold text-red-700">{mensaje}</p>}</div>);
  return (
    <div className="mx-auto max-w-md space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); void buscar(cedula); }} className="flex gap-2">
        <input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Número de cédula" autoComplete="off" className="min-w-0 flex-1 rounded border border-slate-400 px-3 py-3 text-lg" />
        <button className="rounded bg-slate-800 px-5 py-3 font-semibold text-white">Buscar</button>
      </form>
      {!ficha && <LectorQr onCodigo={(c) => { setCedula(c); void buscar(c); }} />}
      {mensaje && <p role="alert" className="font-semibold text-red-700">{mensaje}</p>}
      {ficha && (
        <section className="space-y-3 rounded border p-3">
          <p className="text-lg font-semibold">{ficha.nombre}</p>
          <p className="text-sm">Cédula {ficha.cedula} · junta {ficha.junta}</p>
          <p className={`font-semibold ${ficha.completos ? "text-green-800" : "text-amber-800"}`}>{ficha.completos ? "Documentos completos" : `Faltan: ${[!ficha.anverso && "anverso", !ficha.reverso && "reverso"].filter(Boolean).join(" y ")}`}</p>
          <div className="grid gap-2">
            <button onClick={() => setLado("anverso")} className="rounded bg-blue-700 px-4 py-4 text-lg font-bold text-white">{ficha.anverso ? "Sustituir anverso" : "Fotografiar anverso"}</button>
            <button onClick={() => setLado("reverso")} className="rounded bg-blue-700 px-4 py-4 text-lg font-bold text-white">{ficha.reverso ? "Sustituir reverso" : "Fotografiar reverso"}</button>
            <button onClick={() => { setFicha(null); setCedula(""); }} className="rounded border-2 border-slate-600 px-4 py-3 font-semibold">Otra persona</button>
          </div>
        </section>
      )}
    </div>
  );
}
