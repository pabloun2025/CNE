"use client";

import jsQR from "jsqr";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { unlockAudio } from "./sonidos";

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

type DetectorTexto = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

async function capturar(video: HTMLVideoElement): Promise<Blob | null> {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return null;
  const escala = Math.min(1, 900 / Math.max(w, h));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(w * escala);
  lienzo.height = Math.round(h * escala);
  lienzo.getContext("2d")?.drawImage(video, 0, 0, lienzo.width, lienzo.height);
  return new Promise((resolve) => lienzo.toBlob((b) => resolve(b), "image/jpeg", 0.7));
}

// Si el fotograma no trae QR, se intenta el nombre impreso. Si el navegador no tiene lector de texto, lo intenta el servidor.
async function leerNombreImpreso(video: HTMLVideoElement): Promise<string> {
  const Ctor = (window as unknown as { TextDetector?: new () => DetectorTexto }).TextDetector;
  if (Ctor) {
    try {
      const bloques = await new Ctor().detect(video);
      return bloques.map((b) => b.rawValue).join(" ").trim();
    } catch { /* este navegador no leyó el texto */ }
  }
  const imagen = await capturar(video);
  if (!imagen) return "";
  const f = new FormData();
  f.set("imagen", imagen, "credencial.jpg");
  const r = await fetch("/api/e/puerta/texto", { method: "POST", body: f });
  if (!r.ok) return "";
  const d = (await r.json()) as { texto?: string };
  return (d.texto ?? "").trim();
}

// Cámara trasera con BarcodeDetector o, si no existe (Safari, Firefox), jsQR sobre cada fotograma.
// «Activar cámara» es un toque del usuario: también desbloquea el audio. No decide nada: entrega el texto leído.
// leerNombre: en la puerta, si no hay QR, intenta el nombre impreso.
// encuadre: la puerta usa el visor cuadrado de teinvito. Pago y documentación no.
export function LectorQr({ onCodigo, onError, leerNombre = false, encuadre = false, children }: { onCodigo: (texto: string, origen?: "qr" | "nombre") => void; onError?: () => void; leerNombre?: boolean; encuadre?: boolean; children?: ReactNode }) {
  const video = useRef<HTMLVideoElement>(null);
  const [activa, setActiva] = useState(false);
  const [falloCamara, setFalloCamara] = useState(false);
  const ultimo = useRef("");
  const alCodigo = useRef(onCodigo);
  const alError = useRef(onError);
  const leyendoNombre = useRef(false);
  const ultimoNombre = useRef(0);
  const quiereNombre = useRef(leerNombre);
  useEffect(() => { alCodigo.current = onCodigo; alError.current = onError; quiereNombre.current = leerNombre; });

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
          if (valor) {
            if (valor === ultimo.current) return;
            ultimo.current = valor;
            alCodigo.current(valor, "qr");
            window.setTimeout(() => { ultimo.current = ""; }, 3000);
            return;
          }
          // El nombre no bloquea el QR: si la cámara no lo lee, se teclea.
          if (!quiereNombre.current || leyendoNombre.current || Date.now() - ultimoNombre.current < 2000) return;
          leyendoNombre.current = true;
          ultimoNombre.current = Date.now();
          void leerNombreImpreso(v).then((texto) => {
            if (!texto || texto === ultimo.current) return;
            ultimo.current = texto;
            alCodigo.current(texto, "nombre");
            window.setTimeout(() => { ultimo.current = ""; }, 3000);
          }).catch(() => undefined).finally(() => { leyendoNombre.current = false; });
        }).catch(() => undefined).finally(() => { ocupado = false; });
      }, detector ? 500 : 300);
    }).catch(() => { setFalloCamara(true); setActiva(false); alError.current?.(); });
    return () => {
      window.clearInterval(temporizador);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, [activa]);

  return (
    <div className={encuadre ? "relative mx-auto aspect-square max-h-[45vh] w-full max-w-[45vh] overflow-hidden border-2 border-stone-900 bg-black" : "relative overflow-hidden border-2 border-stone-900 bg-black"} style={encuadre ? undefined : { minHeight: 240 }}>
      <video ref={video} playsInline muted className={encuadre ? "h-full w-full object-cover" : "h-full max-h-[60vh] w-full object-cover"} />
      {encuadre && activa && (
        <>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <div className="aspect-square w-[65%] border-4 border-[#f2b705] shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />
          </div>
          <p className="pointer-events-none absolute inset-x-0 bottom-1 px-2 text-center text-xs font-medium text-white [text-shadow:0_1px_2px_#000]">Encuadre el QR en el recuadro amarillo</p>
        </>
      )}
      {children}
      {!activa && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-slate-800 p-4 text-center text-white">
          {falloCamara && <p role="alert">{leerNombre ? "No se pudo usar la cámara. Revise el permiso o escriba el nombre." : "No se pudo usar la cámara. Revise el permiso o escriba la cédula."}</p>}
          <button onClick={() => { unlockAudio(); setFalloCamara(false); setActiva(true); }} className="bg-white px-6 py-4 text-xl text-stone-900">Activar cámara</button>
        </div>
      )}
    </div>
  );
}
