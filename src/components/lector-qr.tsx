"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import { unlockAudio } from "./sonidos";

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

// Cámara trasera con BarcodeDetector o, si no existe (Safari, Firefox), jsQR sobre cada fotograma.
// «Activar cámara» es un toque del usuario: también desbloquea el audio. No decide nada: entrega el texto leído.
export function LectorQr({ onCodigo, onError }: { onCodigo: (texto: string) => void; onError?: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [activa, setActiva] = useState(false);
  const [falloCamara, setFalloCamara] = useState(false);
  const ultimo = useRef("");
  const alCodigo = useRef(onCodigo);
  const alError = useRef(onError);
  useEffect(() => { alCodigo.current = onCodigo; alError.current = onError; });

  useEffect(() => {
    const v = video.current;
    if (!activa || !v || !navigator.mediaDevices?.getUserMedia) return;
    let flujo: MediaStream | null = null;
    let temporizador = 0;
    const Ctor = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    const detector = Ctor ? new Ctor({ formats: ["qr_code"] }) : null;
    const lienzo = document.createElement("canvas");
    const leer = async (): Promise<string> => {
      if (detector) return (await detector.detect(v))[0]?.rawValue || "";
      const w = v.videoWidth, h = v.videoHeight;
      if (!w || !h) return "";
      const escala = Math.min(1, 640 / Math.max(w, h));
      lienzo.width = Math.round(w * escala);
      lienzo.height = Math.round(h * escala);
      const c = lienzo.getContext("2d", { willReadFrequently: true });
      if (!c) return "";
      c.drawImage(v, 0, 0, lienzo.width, lienzo.height);
      const f = c.getImageData(0, 0, lienzo.width, lienzo.height);
      return jsQR(f.data, f.width, f.height, { inversionAttempts: "dontInvert" })?.data || "";
    };
    let ocupado = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then((m) => {
      flujo = m;
      v.srcObject = m;
      void v.play();
      temporizador = window.setInterval(() => {
        if (ocupado) return;
        ocupado = true;
        void leer().then((valor) => {
          // Antirrebote en cliente: la misma lectura en menos de 3 s se ignora.
          if (!valor || valor === ultimo.current) return;
          ultimo.current = valor;
          alCodigo.current(valor);
          window.setTimeout(() => { ultimo.current = ""; }, 3000);
        }).catch(() => undefined).finally(() => { ocupado = false; });
      }, detector ? 500 : 300);
    }).catch(() => { setFalloCamara(true); setActiva(false); alError.current?.(); });
    return () => {
      window.clearInterval(temporizador);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, [activa]);

  return (
    <div className="relative overflow-hidden rounded bg-black" style={{ minHeight: 240 }}>
      <video ref={video} playsInline muted className="h-full max-h-[60vh] w-full object-cover" />
      {!activa && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-800 p-4 text-center text-white">
          {falloCamara && <p role="alert">No se pudo usar la cámara. Revise el permiso o escriba la cédula.</p>}
          <button onClick={() => { unlockAudio(); setFalloCamara(false); setActiva(true); }} className="rounded bg-blue-600 px-6 py-4 text-xl font-bold">Activar cámara</button>
        </div>
      )}
    </div>
  );
}
