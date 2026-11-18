"use client";

import { useEffect, useRef, useState } from "react";
import { aGrises, DetectorCaptura, diferenciaMedia, varianzaLaplaciano } from "@/domain/captura-auto";

const ID1 = 85.6 / 54; // proporción de la tarjeta de identidad
const MAX_PX = 1600;

// Cámara trasera con recuadro de proporción ID-1, «Tomar foto», vista previa «Usar / Repetir», recorte al recuadro
// y reducción a ≤ 1.600 px en canvas. Si no hay cámara se ofrece elegir/hacer la foto con el selector del móvil.
// Captura automática (M23): cuando la imagen del recuadro está quieta y nítida ~1 s, toma la foto sola. El botón manual siempre está visible.
export function CapturaCedula({ rotulo, onUsar }: { rotulo: string; onUsar: (imagen: Blob) => void | Promise<void> }) {
  const video = useRef<HTMLVideoElement>(null);
  const [lista, setLista] = useState(false);
  const [sinCamara, setSinCamara] = useState(false);
  const [dim, setDim] = useState({ w: 4, h: 3 });
  const [previa, setPrevia] = useState<{ blob: Blob; url: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [auto, setAuto] = useState(true);
  const [progreso, setProgreso] = useState(0);
  const detector = useRef(new DetectorCaptura());
  const anterior = useRef<Uint8ClampedArray | null>(null);
  const enfriarHasta = useRef(0);
  const alTomar = useRef<() => void>(() => undefined);

  useEffect(() => {
    let flujo: MediaStream | null = null;
    let vivo = true;
    if (!navigator.mediaDevices?.getUserMedia) { queueMicrotask(() => setSinCamara(true)); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } } }).then((m) => {
      if (!vivo) { m.getTracks().forEach((t) => t.stop()); return; }
      flujo = m;
      const v = video.current;
      if (!v) return;
      v.srcObject = m;
      v.onloadedmetadata = () => { setDim({ w: v.videoWidth, h: v.videoHeight }); setLista(true); };
      void v.play();
    }).catch(() => setSinCamara(true));
    return () => { vivo = false; flujo?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // Recuadro en coordenadas del vídeo: 92 % del ancho, con proporción ID-1, sin pasarse del alto.
  const recuadro = () => {
    let w = dim.w * 0.92, h = w / ID1;
    if (h > dim.h * 0.92) { h = dim.h * 0.92; w = h * ID1; }
    return { x: (dim.w - w) / 2, y: (dim.h - h) / 2, w, h };
  };

  const aBlob = (origen: CanvasImageSource, sx: number, sy: number, sw: number, sh: number) =>
    new Promise<Blob | null>((resolve) => {
      const escala = Math.min(1, MAX_PX / Math.max(sw, sh));
      const c = document.createElement("canvas");
      c.width = Math.round(sw * escala); c.height = Math.round(sh * escala);
      c.getContext("2d")!.drawImage(origen, sx, sy, sw, sh, 0, 0, c.width, c.height);
      c.toBlob(resolve, "image/jpeg", 0.85);
    });

  // Muestreo cada 150 ms de una miniatura del recuadro: nitidez (laplaciano) y movimiento frente al fotograma anterior.
  useEffect(() => {
    if (!lista || previa || !auto) return;
    const mini = document.createElement("canvas");
    const id = window.setInterval(() => {
      const v = video.current;
      if (!v || v.readyState < 2) return;
      let w = dim.w * 0.92, h = w / ID1;
      if (h > dim.h * 0.92) { h = dim.h * 0.92; w = h * ID1; }
      mini.width = 320; mini.height = Math.round(320 / ID1);
      const ctx = mini.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(v, (dim.w - w) / 2, (dim.h - h) / 2, w, h, 0, 0, mini.width, mini.height);
      const g = aGrises(ctx.getImageData(0, 0, mini.width, mini.height).data);
      const movimiento = anterior.current?.length === g.length ? diferenciaMedia(anterior.current, g) : 255;
      anterior.current = g;
      const ahora = performance.now();
      if (ahora < enfriarHasta.current) return;
      const e = detector.current.evaluar({ t: ahora, nitidez: varianzaLaplaciano(g, mini.width, mini.height), movimiento });
      setProgreso(e.progreso);
      if (e.dispara) { detector.current.reiniciar(); setProgreso(0); alTomar.current(); }
    }, 150);
    return () => window.clearInterval(id);
  }, [lista, previa, auto, dim]);

  const mostrar = (blob: Blob | null) => { if (blob) setPrevia({ blob, url: URL.createObjectURL(blob) }); };
  const tomar = async () => {
    const v = video.current;
    if (!v) return;
    const r = recuadro();
    mostrar(await aBlob(v, r.x, r.y, r.w, r.h));
  };
  useEffect(() => { alTomar.current = () => { void tomar(); }; });
  const deArchivo = async (f: File | undefined) => {
    if (!f) return;
    const bmp = await createImageBitmap(f);
    mostrar(await aBlob(bmp, 0, 0, bmp.width, bmp.height));
  };
  const repetir = () => {
    if (previa) URL.revokeObjectURL(previa.url);
    setPrevia(null);
    // Pausa para recolocar el documento antes de otra captura automática.
    detector.current.reiniciar(); anterior.current = null; enfriarHasta.current = performance.now() + 2000; setProgreso(0);
  };
  const usar = async () => {
    if (!previa) return;
    setEnviando(true);
    try { await onUsar(previa.blob); repetir(); } finally { setEnviando(false); }
  };

  if (previa) {
    return (
      <div className="space-y-3">
        <p className="font-semibold">{rotulo}: ¿se lee bien?</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previa.url} alt={`Vista previa del ${rotulo}`} className="w-full rounded border" />
        <div className="flex gap-3">
          <button disabled={enviando} onClick={usar} className="flex-1 bg-green-800 px-4 py-4 text-lg text-white disabled:opacity-60">Usar esta foto</button>
          <button disabled={enviando} onClick={repetir} className="flex-1 border-2 border-stone-900 px-4 py-4 text-lg">Repetir</button>
        </div>
      </div>
    );
  }
  const r = recuadro();
  return (
    <div className="space-y-3">
      <p className="font-semibold">{rotulo}</p>
      {!sinCamara && (
        <div className="relative w-full overflow-hidden rounded bg-black" style={{ aspectRatio: `${dim.w} / ${dim.h}` }}>
          <video ref={video} playsInline muted className="h-full w-full object-cover" />
          {lista && <div aria-hidden className="absolute border-4 border-white shadow-[0_0_0_999px_rgba(0,0,0,0.45)]" style={{ left: `${(r.x / dim.w) * 100}%`, top: `${(r.y / dim.h) * 100}%`, width: `${(r.w / dim.w) * 100}%`, height: `${(r.h / dim.h) * 100}%` }} />}
        </div>
      )}
      {!sinCamara && lista && (
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); setProgreso(0); detector.current.reiniciar(); }} className="h-5 w-5" />Captura automática</label>
          {auto && (
            <div role="status" aria-live="polite" className="text-sm">
              <div className="h-2 w-full overflow-hidden rounded bg-slate-200"><div className="h-full bg-green-600" style={{ width: `${Math.round(progreso * 100)}%` }} /></div>
              {progreso > 0 ? "Mantenga el documento quieto…" : "Se toma sola cuando el documento esté quieto y nítido. También puede pulsar «Tomar foto»."}
            </div>
          )}
        </div>
      )}
      {sinCamara && <p role="status" className="text-sm">No se pudo abrir la cámara. Use el botón de abajo para hacer o elegir la foto.</p>}
      {!sinCamara && <button onClick={tomar} disabled={!lista} className="w-full bg-stone-900 px-4 py-4 text-lg text-white disabled:opacity-60">Tomar foto</button>}
      <label className="block w-full cursor-pointer border-2 border-stone-900 px-4 py-3 text-center">
        {sinCamara ? "Hacer o elegir foto" : "O elegir una foto del teléfono"}
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => deArchivo(e.target.files?.[0])} />
      </label>
      <p className="text-sm text-slate-600">Coloque el documento dentro del recuadro, sin reflejos y con buena luz.</p>
    </div>
  );
}
