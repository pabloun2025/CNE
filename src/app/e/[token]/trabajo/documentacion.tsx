"use client";

import { useEffect, useRef, useState } from "react";
import { CapturaCedula } from "@/components/captura-cedula";
import { LectorQr } from "@/components/lector-qr";

type Ficha = { mjrvId: number; nombre: string; cedula: string; junta: string; anverso: boolean; reverso: boolean; completos: boolean };

// Estación de documentación. En la ventanilla de pago, `abrirFaltante` dispara la cara que falta antes de cualquier otra cosa.
export function Documentacion({ inicial, abrirFaltante, alCompletar }: { inicial?: string; abrirFaltante?: boolean; alCompletar?: () => void }) {
  const [cedula, setCedula] = useState(inicial ?? "");
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [lado, setLado] = useState<"anverso" | "reverso" | null>(null);
  const [mensaje, setMensaje] = useState("");

  const aplicar = (d: Ficha) => {
    setFicha(d);
    setMensaje("");
    if (abrirFaltante && !d.completos) setLado(d.anverso ? "reverso" : "anverso");
    else setLado(null);
    if (d.completos) alCompletar?.();
  };
  const buscar = async (c: string) => {
    setMensaje("");
    try {
      const r = await fetch("/api/e/documentacion/buscar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cedula: c }) });
      const d = await r.json();
      if (!r.ok) setMensaje("No se pudo consultar. Revise la conexión.");
      else if (!d.encontrada) { setFicha(null); setMensaje("No encontramos esa cédula."); }
      else aplicar(d);
    } catch { setMensaje("No hay conexión."); }
  };
  const buscada = useRef("");
  useEffect(() => {
    if (inicial && buscada.current !== inicial) { buscada.current = inicial; void buscar(inicial); }
    // La búsqueda inicial solo corre cuando cambia la cédula que trae la ventanilla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicial]);
  const subir = async (imagen: Blob) => {
    if (!ficha || !lado) return;
    const f = new FormData();
    f.set("lado", lado); f.set("mjrvId", String(ficha.mjrvId)); f.set("imagen", new File([imagen], `${lado}.jpg`, { type: "image/jpeg" }));
    try {
      const r = await fetch("/api/e/documentacion/foto", { method: "POST", body: f });
      const d = await r.json();
      if (!r.ok) { setMensaje(d.error ?? "No se pudo guardar."); return; }
      aplicar({ ...ficha, anverso: d.anverso, reverso: d.reverso, completos: d.completos });
    } catch { setMensaje("No hay conexión."); }
  };

  if (abrirFaltante && !ficha && !mensaje) return <p>Buscando la cédula…</p>;
  if (ficha && lado) return (<div className="mx-auto max-w-md space-y-3">{!abrirFaltante && <button onClick={() => setLado(null)} className="border-2 border-stone-900 px-4 py-3">← Volver</button>}<CapturaCedula rotulo={lado === "anverso" ? "Anverso" : "Reverso"} onUsar={subir} />{mensaje && <p role="alert" className="font-semibold text-red-700">{mensaje}</p>}</div>);
  return (
    <div className="mx-auto max-w-md space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); void buscar(cedula); }} className="flex gap-2">
        <input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Número de cédula" autoComplete="off" className="min-w-0 flex-1" />
        <button className="bg-stone-900 px-4 text-white">Buscar</button>
      </form>
      {!ficha && <LectorQr onCodigo={(c) => { setCedula(c); void buscar(c); }} />}
      {mensaje && <p role="alert" className="font-semibold text-red-700">{mensaje}</p>}
      {ficha && (
        <section className="space-y-3 border-2 border-stone-900 p-3">
          <p className="text-xl font-bold">{ficha.nombre}</p>
          <p>Cédula {ficha.cedula} · junta {ficha.junta}</p>
          <p className={`font-bold ${ficha.completos ? "text-green-800" : "text-amber-800"}`}>{ficha.completos ? "Documentos completos" : `Faltan: ${[!ficha.anverso && "anverso", !ficha.reverso && "reverso"].filter(Boolean).join(" y ")}`}</p>
          <div className="grid gap-2">
            <button onClick={() => setLado("anverso")} className="bg-stone-900 px-4 py-4 text-lg text-white">{ficha.anverso ? "Sustituir anverso" : "Fotografiar anverso"}</button>
            <button onClick={() => setLado("reverso")} className="bg-stone-900 px-4 py-4 text-lg text-white">{ficha.reverso ? "Sustituir reverso" : "Fotografiar reverso"}</button>
            {!abrirFaltante && <button onClick={() => { setFicha(null); setCedula(""); }} className="border-2 border-stone-900 px-4 py-3">Otra persona</button>}
          </div>
        </section>
      )}
    </div>
  );
}
