"use client";

import { useState } from "react";
import { CapturaCedula } from "./captura-cedula";
import { Masthead } from "./marca";

type Hallada = { iniciales: string; junta: string; anverso: boolean; reverso: boolean };
type Paso = "cedula" | "confirmar" | "anverso" | "reverso" | "fin";

// Formulario público del QR genérico: cédula → «¿Es usted?» → anverso → reverso. No vuelve a mostrar las fotos.
export function FormularioDocumentos() {
  const [paso, setPaso] = useState<Paso>("cedula");
  const [cedula, setCedula] = useState("");
  const [hallada, setHallada] = useState<Hallada | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [cargando, setCargando] = useState(false);

  const buscar = async () => {
    setMensaje(""); setCargando(true);
    try {
      const r = await fetch("/api/d/buscar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cedula }) });
      const d = await r.json();
      if (!r.ok) setMensaje(d.error ?? "No se pudo consultar.");
      else if (!d.encontrada) setMensaje("No encontramos esa cédula. Pida ayuda al personal.");
      else { setHallada(d); setPaso("confirmar"); }
    } catch { setMensaje("No hay conexión. Intente de nuevo."); } finally { setCargando(false); }
  };

  const subir = (lado: "anverso" | "reverso") => async (imagen: Blob) => {
    setMensaje("");
    const f = new FormData();
    f.set("lado", lado); f.set("cedula", cedula); f.set("imagen", new File([imagen], `${lado}.jpg`, { type: "image/jpeg" }));
    try {
      const r = await fetch("/api/d/foto", { method: "POST", body: f });
      const d = await r.json();
      if (!r.ok) { setMensaje(d.error ?? "No se pudo guardar la foto."); return; }
      setPaso(lado === "anverso" ? "reverso" : "fin");
    } catch { setMensaje("No hay conexión. Intente de nuevo."); }
  };

  return (
    <div className="funcionario sheet">
      <Masthead titulo="CNE 2026" detalle="Madrid" />
      <main>
      <h1>Foto de su cédula</h1>
      {paso === "cedula" && (
        <form onSubmit={(e) => { e.preventDefault(); void buscar(); }} className="space-y-3">
          <label className="block font-medium">Escriba su número de cédula
            <input value={cedula} onChange={(e) => setCedula(e.target.value)} inputMode="numeric" autoComplete="off" required className="mt-1 w-full rounded border border-slate-400 px-3 py-4 text-xl" />
          </label>
          <button disabled={cargando} className="w-full rounded bg-blue-700 px-4 py-4 text-lg font-bold text-white disabled:opacity-60">Continuar</button>
        </form>
      )}
      {paso === "confirmar" && hallada && (
        <div className="space-y-3">
          <p className="text-lg">Encontramos la ficha de <strong>{hallada.iniciales}</strong>, junta <strong>{hallada.junta}</strong>. ¿Es usted?</p>
          <div className="flex gap-3">
            <button onClick={() => setPaso("anverso")} className="flex-1 rounded bg-green-700 px-4 py-4 text-lg font-bold text-white">Sí, soy yo</button>
            <button onClick={() => { setPaso("cedula"); setHallada(null); }} className="flex-1 rounded border-2 border-slate-600 px-4 py-4 text-lg font-bold">No</button>
          </div>
        </div>
      )}
      {paso === "anverso" && <CapturaCedula rotulo="Anverso (la cara con su foto)" onUsar={subir("anverso")} />}
      {paso === "reverso" && <CapturaCedula rotulo="Reverso (la otra cara)" onUsar={subir("reverso")} />}
      {paso === "fin" && <p role="status" className="border-2 border-stone-900 p-4 text-lg font-semibold">Listo. Sus dos fotos se guardaron.</p>}
      {mensaje && <p role="alert" className="banner bad">{mensaje}</p>}
      </main>
    </div>
  );
}
