"use client";

import { useState } from "react";
import { CapturaDocumentosPuesto, type EstadoFotos } from "@/components/captura-cedula";
import { LectorQr } from "@/components/lector-qr";
import type { LadoDocumento } from "@/domain/documentos";

type Ficha = EstadoFotos & { mjrvId: number; nombre: string; cedula: string; junta: string; completos: boolean };

export function Documentacion({ token }: { token: string }) {
  const [cedula, setCedula] = useState("");
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const buscar = async (c: string) => {
    setMensaje("");
    setOcupado(true);
    try {
      const r = await fetch("/api/e/documentacion/buscar", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ cedula: c }) });
      const d = await r.json();
      if (r.status === 401 || r.status === 403) setMensaje("El enlace ya no está activo. Pida uno nuevo a la administración.");
      else if (!r.ok) setMensaje("No se pudo consultar. Revise la conexión.");
      else if (!d.encontrada) { setFicha(null); setMensaje("No encontramos ese número."); }
      else setFicha(d);
    } catch { setMensaje("No hay conexión."); } finally { setOcupado(false); }
  };
  const subir = async (lado: LadoDocumento, imagen: Blob) => {
    if (!ficha) return false;
    setMensaje("");
    setOcupado(true);
    const f = new FormData();
    f.set("lado", lado); f.set("mjrvId", String(ficha.mjrvId)); f.set("imagen", new File([imagen], `${lado}.jpg`, { type: "image/jpeg" }));
    try {
      const r = await fetch("/api/e/documentacion/foto", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: f });
      const d = await r.json();
      if (!r.ok) { setMensaje(d.error ?? "No se pudo guardar."); return false; }
      setFicha({ ...ficha, anverso: d.anverso, reverso: d.reverso, pasaporte: d.pasaporte, completos: d.completos });
      return true;
    } catch { setMensaje("No hay conexión."); return false; } finally { setOcupado(false); }
  };

  return (
    <div className="mx-auto max-w-md space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); void buscar(cedula); }} className="flex gap-2">
        <input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Número de cédula" aria-label="Número de cédula" autoComplete="off" required disabled={ocupado} className="min-w-0 flex-1" />
        <button disabled={ocupado} className="bg-stone-900 px-4 text-white disabled:opacity-60">Buscar</button>
      </form>
      {!ficha && <LectorQr pausado={ocupado} onCodigo={(c) => { setCedula(c); void buscar(c); }} />}
      {mensaje && <p role="alert" className="font-semibold text-red-700">{mensaje}</p>}
      {ficha && (
        <section className="space-y-3 border-2 border-stone-900 p-3">
          <p className="text-xl font-bold">{ficha.nombre}</p>
          <p>{ficha.cedula} · junta {ficha.junta}</p>
          <p role="status" className={`font-bold ${ficha.completos ? "text-green-800" : "text-amber-800"}`}>
            {ficha.pasaporte ? "Página de datos del pasaporte guardada" : ficha.completos ? "Anverso y reverso de la cédula guardados" : ficha.anverso ? "Falta el reverso de la cédula" : ficha.reverso ? "Falta el anverso de la cédula" : "Sin fotos del documento"}
          </p>
          <CapturaDocumentosPuesto key={ficha.mjrvId} fotos={ficha} onUsar={subir} />
          <button disabled={ocupado} onClick={() => { setFicha(null); setCedula(""); setMensaje(""); }} className="border-2 border-stone-900 px-4 py-3 disabled:opacity-60">Otra persona</button>
        </section>
      )}
    </div>
  );
}
