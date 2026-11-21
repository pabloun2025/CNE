"use client";

import { useState } from "react";
import type { LadoDocumento } from "@/domain/documentos";
import { AvisoCambioDocumento, CapturaCedula, ElegirDocumento, ROTULO_FOTO, type EstadoFotos } from "./captura-cedula";
import { Masthead } from "./marca";

type Hallada = EstadoFotos & { iniciales: string; junta: string };
type Paso = "buscar" | "confirmar" | "documento" | LadoDocumento | "fin";

// El formulario público localiza la ficha antes de pedir el documento y nunca vuelve a mostrar las fotos guardadas.
export function FormularioDocumentos() {
  const [paso, setPaso] = useState<Paso>("buscar");
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
      else if (!d.encontrada) setMensaje("No encontramos ese número de cédula. Pida ayuda al personal.");
      else { setHallada(d); setPaso("confirmar"); }
    } catch { setMensaje("No hay conexión. Intente de nuevo."); } finally { setCargando(false); }
  };

  const subir = (lado: LadoDocumento) => async (imagen: Blob) => {
    setMensaje("");
    const f = new FormData();
    f.set("lado", lado); f.set("cedula", cedula); f.set("imagen", new File([imagen], `${lado}.jpg`, { type: "image/jpeg" }));
    try {
      const r = await fetch("/api/d/foto", { method: "POST", body: f });
      const d = await r.json();
      if (!r.ok) { setMensaje(d.error ?? "No se pudo guardar la foto."); return false; }
      if (hallada) setHallada({ ...hallada, anverso: d.anverso, reverso: d.reverso, pasaporte: d.pasaporte });
      if (lado === "anverso") setPaso("reverso");
      else if (d.completos) setPaso("fin");
      else setPaso("anverso");
      return true;
    } catch { setMensaje("No hay conexión. Intente de nuevo."); return false; }
  };

  return (
    <div className="funcionario sheet">
      <Masthead titulo="CNE 2026" detalle="Madrid" />
      <main>
      <h1>Foto de su documento</h1>
      {paso === "buscar" && (
        <form onSubmit={(e) => { e.preventDefault(); void buscar(); }} className="space-y-3">
          <label className="block font-medium">Número de cédula
            <input value={cedula} onChange={(e) => setCedula(e.target.value)} inputMode="numeric" autoComplete="off" autoCapitalize="characters" required className="mt-1 w-full rounded border border-slate-400 px-3 py-4 text-xl" />
          </label>
          <button disabled={cargando} className="w-full rounded bg-blue-700 px-4 py-4 text-lg font-bold text-white disabled:opacity-60">Continuar</button>
        </form>
      )}
      {paso === "confirmar" && hallada && (
        <div className="space-y-3">
          <p className="text-lg">Encontramos la ficha de <strong>{hallada.iniciales}</strong>, junta <strong>{hallada.junta}</strong>. ¿Es usted?</p>
          <div className="flex gap-3">
            <button onClick={() => setPaso("documento")} className="flex-1 rounded bg-green-700 px-4 py-4 text-lg font-bold text-white">Sí, soy yo</button>
            <button onClick={() => { setPaso("buscar"); setHallada(null); }} className="flex-1 rounded border-2 border-slate-600 px-4 py-4 text-lg font-bold">No</button>
          </div>
        </div>
      )}
      {paso === "documento" && <ElegirDocumento onElegir={(tipo) => setPaso(tipo === "pasaporte" ? "pasaporte" : "anverso")} />}
      {(paso === "anverso" || paso === "reverso" || paso === "pasaporte") && hallada && (
        <div className="space-y-2">
          <AvisoCambioDocumento tipo={paso === "pasaporte" ? "pasaporte" : "cedula"} fotos={hallada} />
          <CapturaCedula rotulo={ROTULO_FOTO[paso]} documento={paso === "pasaporte" ? "pasaporte" : "cedula"} onUsar={subir(paso)}
            onVolver={() => { setMensaje(""); setPaso("documento"); }} />
        </div>
      )}
      {paso === "fin" && <p role="status" className="border-2 border-stone-900 p-4 text-lg font-semibold">{hallada?.pasaporte ? "Listo. La foto de su pasaporte se guardó." : "Listo. Sus dos fotos se guardaron."}</p>}
      {mensaje && <p role="alert" className="banner bad">{mensaje}</p>}
      </main>
    </div>
  );
}
