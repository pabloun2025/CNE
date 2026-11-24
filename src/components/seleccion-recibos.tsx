"use client";

import { useEffect, useState } from "react";
import { leerPdfRecibo, VisorRecibo, type PdfRecibo } from "./visor-recibo";

type Ficha = { id: number; nombre: string; cedula: string; junta: string };

export function SeleccionRecibos({ fichas, modo }: { fichas: Ficha[]; modo: "prueba" | "eleccion" }) {
  const [elegidas, cambiar] = useState<number[]>([]);
  const [manual, setManual] = useState(false);
  const [conFotos, setConFotos] = useState(false);
  const [ocupada, setOcupada] = useState(false);
  const [resultado, setResultado] = useState<PdfRecibo | null>(null);
  const [mensaje, setMensaje] = useState("");
  const todas = elegidas.length === fichas.length;
  const url = resultado?.url;
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function generar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (ocupada || !elegidas.length) return;
    const datos = new FormData(e.currentTarget);
    if (manual || !conFotos) datos.set("formato", manual ? "manual" : "sin_anexo");

    setOcupada(true);
    setResultado(null);
    setMensaje("");
    try {
      const pdf = await leerPdfRecibo(await fetch("/api/admin/finanzas/recibos/emitir", { method: "POST", body: datos }));
      if (elegidas.length === 1) {
        setResultado(pdf);
      } else {
        const enlace = document.createElement("a");
        enlace.href = pdf.url;
        enlace.download = pdf.nombre;
        document.body.append(enlace);
        enlace.click();
        enlace.remove();
        setResultado(pdf);
        setMensaje("El lote está listo para imprimir.");
      }
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "No se pudo generar el PDF.");
    } finally {
      setOcupada(false);
    }
  }

  return (
    <>
      <form onSubmit={generar} className="card stack">
        <input type="hidden" name="modo" value={modo} />
        <fieldset disabled={ocupada} className="stack">
          <legend className="font-semibold">Numeración</legend>
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-2"><input type="radio" name="numeracion" checked={!manual} onChange={() => setManual(false)} /> Automática</label>
            <label className="flex items-center gap-2"><input type="radio" name="numeracion" checked={manual} onChange={() => setManual(true)} /> En blanco para rellenar a mano</label>
          </div>
          <p className="hint">{manual ? "El número y el importe en euros quedan en blanco. El formulario se fecha el 29 de noviembre de 2026." : "Al emitir se asigna el número. Si ya existe un recibo, conserva su número e importe."}</p>
          {!manual && <label className="flex items-center gap-2"><input type="checkbox" checked={conFotos} onChange={(e) => setConFotos(e.target.checked)} /> Incluir las fotos disponibles</label>}
        </fieldset>
        <fieldset disabled={ocupada} className="stack">
          <legend className="font-semibold">MJRV</legend>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="button-like secondary" onClick={() => cambiar(todas ? [] : fichas.map((f) => f.id))}>
              {todas ? "Quitar selección" : "Seleccionar todas las visibles"}
            </button>
            <p role="status">{elegidas.length} de {fichas.length} seleccionadas</p>
          </div>
          <ul className="max-h-96 overflow-y-auto divide-y">
            {fichas.map((f) => (
              <li key={f.id} className="py-2">
                <label className="flex items-center gap-3">
                  <input type="checkbox" name="id" value={f.id} checked={elegidas.includes(f.id)} onChange={(e) => {
                    const marcada = e.target.checked;
                    cambiar((ids) => marcada ? [...ids, f.id] : ids.filter((id) => id !== f.id));
                  }} />
                  <span>{f.nombre}<span className="block text-sm">{f.junta} · {f.cedula}</span></span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <button className="button-like" disabled={!elegidas.length || ocupada}>
          {ocupada ? "Generando PDF…" : elegidas.length > 1 ? "Descargar lote en PDF" : "Imprimir recibo"}
        </button>
        {mensaje && <p role="status">{mensaje}</p>}
      </form>
      {resultado && (mensaje ? (
        <a href={resultado.url} download={resultado.nombre} className="button-like secondary">Descargar de nuevo el mismo PDF</a>
      ) : <VisorRecibo key={resultado.url} {...resultado} />)}
    </>
  );
}
