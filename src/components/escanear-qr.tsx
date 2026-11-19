"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { LectorQr } from "@/components/lector-qr";

type Escaneo =
  | { ok: true; modo: "impresion"; junta: string; nombre: string }
  | { ok: true; modo: "digital"; mjrvId: number; junta: string; nombre: string }
  | { ok: false; mensaje: string };

export function EscanearQr() {
  const [cedula, setCedula] = useState("");
  const [aviso, setAviso] = useState("");
  const [firma, setFirma] = useState<Extract<Escaneo, { ok: true; modo: "digital" }> | null>(null);
  const [modo, setModo] = useState<"impresion" | "digital">("impresion");

  useEffect(() => {
    let vivo = true;
    const leer = () => fetch("/api/admin/finanzas/modo").then((r) => r.json()).then((d) => { if (vivo && (d.modo === "digital" || d.modo === "impresion")) setModo(d.modo); }).catch(() => undefined);
    void leer();
    const id = window.setInterval(() => void leer(), 3000);
    return () => { vivo = false; window.clearInterval(id); };
  }, []);

  const escanear = async (c: string) => {
    const t = c.trim();
    if (!t) return;
    setAviso("");
    setFirma(null);
    const r = await fetch("/api/admin/finanzas/escanear", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cedula: t }) });
    const d = (await r.json()) as Escaneo;
    if (!d.ok) { setAviso(d.mensaje); return; }
    if (d.modo === "digital") setFirma(d);
    else setAviso(`Quedó para imprimir. Junta ${d.junta}.`);
    setCedula("");
  };

  return (
    <div className="mx-auto max-w-md space-y-3">
      <p className="text-sm">{modo === "digital" ? "Modo digital: la firma se recoge en esta pantalla." : "Modo impresión: el escaneo deja el acta pendiente en el ordenador."}</p>
      {!firma && <LectorQr abrirAlEntrar onCodigo={(c) => void escanear(c)} />}
      {!firma && (
        <form onSubmit={(e) => { e.preventDefault(); void escanear(cedula); }} className="flex gap-2">
          <input value={cedula} onChange={(e) => setCedula(e.target.value)} aria-label="Cédula" placeholder="Escribir cédula" autoComplete="off" className="min-w-0 flex-1 border border-slate-400 px-3 py-3" />
          <button className="bg-stone-900 px-4 text-white">Continuar</button>
        </form>
      )}
      {firma && <FirmaEnPantalla persona={firma} alTerminar={(texto) => { setFirma(null); setAviso(texto); }} />}
      {aviso && <p role="status" className="font-semibold">{aviso}</p>}
    </div>
  );
}

function FirmaEnPantalla({ persona, alTerminar }: { persona: { mjrvId: number; junta: string; nombre: string }; alTerminar: (texto: string) => void }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [ocupado, setOcupado] = useState(false);
  const trazo = (e: PointerEvent<HTMLCanvasElement>) => {
    const c = lienzo.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) * (c.width / r.width);
    const y = (e.clientY - r.top) * (c.height / r.height);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    if (e.type === "pointerdown") { dibujando.current = true; ctx.beginPath(); ctx.moveTo(x, y); return; }
    if (!dibujando.current) return;
    if (e.type === "pointerup" || e.type === "pointerleave") { dibujando.current = false; return; }
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e293b";
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const guardar = async () => {
    const c = lienzo.current;
    if (!c) return;
    const vacio = !c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0);
    if (vacio) { alTerminar("Firme con el dedo antes de guardar."); return; }
    setOcupado(true);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
    if (!blob) { setOcupado(false); return; }
    const f = new FormData();
    f.set("mjrvId", String(persona.mjrvId));
    f.set("firma", blob, "firma.png");
    const r = await fetch("/api/admin/finanzas/firma", { method: "POST", body: f });
    const d = await r.json();
    setOcupado(false);
    alTerminar(d.ok ? `Firma guardada. Junta ${persona.junta}.` : d.mensaje ?? "No se pudo guardar la firma.");
  };
  return (
    <div className="space-y-2">
      <p className="font-semibold">{persona.nombre}</p>
      <p>Junta {persona.junta}. Firme con el dedo.</p>
      <canvas ref={lienzo} width={600} height={240} className="h-40 w-full touch-none rounded border-2 border-stone-900 bg-white" onPointerDown={trazo} onPointerMove={trazo} onPointerUp={trazo} onPointerLeave={trazo} />
      <div className="flex gap-2">
        <button type="button" disabled={ocupado} onClick={() => void guardar()} className="flex-1 bg-stone-900 px-4 py-3 text-white disabled:opacity-50">Guardar firma</button>
        <button type="button" onClick={() => { const c = lienzo.current; c?.getContext("2d")?.clearRect(0, 0, c.width, c.height); }} className="border-2 border-stone-900 px-4 py-3">Limpiar</button>
      </div>
    </div>
  );
}
