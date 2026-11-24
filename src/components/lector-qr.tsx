"use client";

import jsQR from "jsqr";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { CR80, type MedidasCredencial } from "@/domain/credencial-layout";
import { unlockAudio } from "./sonidos";

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

function capturarCredencial(video: HTMLVideoElement, marco: HTMLElement): HTMLCanvasElement | null {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h || !marco.offsetWidth || !marco.offsetHeight) return null;
  // El vídeo y la guía están centrados. Deshace el escalado de object-fit: cover.
  const escala = Math.max(video.clientWidth / w, video.clientHeight / h);
  if (!escala) return null;
  const ancho = marco.offsetWidth / escala, alto = marco.offsetHeight / escala;
  const salida = Math.min(1, 1200 / Math.max(ancho, alto));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(ancho * salida);
  lienzo.height = Math.round(alto * salida);
  const contexto = lienzo.getContext("2d");
  if (!contexto) return null;
  contexto.drawImage(video, (w - ancho) / 2, (h - alto) / 2, ancho, alto, 0, 0, lienzo.width, lienzo.height);
  return lienzo;
}

async function leerCredencialImpresa(video: HTMLVideoElement, marco: HTMLElement, tokenPuerta: string, signal: AbortSignal): Promise<string> {
  const lienzo = capturarCredencial(video, marco);
  if (!lienzo) return "";
  const imagen = await new Promise<Blob | null>((resolve) => lienzo.toBlob(resolve, "image/jpeg", 0.88));
  if (!imagen) return "";
  const f = new FormData();
  f.set("imagen", imagen, "credencial.jpg");
  const r = await fetch("/api/e/puerta/texto", { method: "POST", headers: { authorization: `Bearer ${tokenPuerta}` }, body: f, signal });
  if (!r.ok) throw new Error("Lector de texto no disponible");
  const d = (await r.json()) as { texto?: string };
  return (d.texto ?? "").trim();
}

// Cámara trasera con BarcodeDetector o, si no existe (Safari, Firefox), jsQR sobre cada fotograma.
// «Activar cámara» es un toque del usuario: también desbloquea el audio. No decide nada: entrega el texto leído.
// tokenPuerta: en la puerta, si no hay QR, intenta leer los datos impresos.
// La puerta ajusta la guía a la credencial impresa. Finanzas conserva su guía de QR.
// abrirAlEntrar: el escáner de Finanzas intenta abrir la cámara al entrar.
export function LectorQr({ onCodigo, onError, tokenPuerta, medidas = CR80, mensajeCredencial, pausado = false, encuadre = false, abrirAlEntrar = false, children }: {
  onCodigo: (texto: string, origen: "qr" | "credencial") => void;
  onError?: () => void;
  tokenPuerta?: string;
  medidas?: MedidasCredencial;
  mensajeCredencial?: string;
  pausado?: boolean;
  encuadre?: boolean;
  abrirAlEntrar?: boolean;
  children?: ReactNode;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const marco = useRef<HTMLDivElement>(null);
  const [activa, setActiva] = useState(abrirAlEntrar);
  const [falloCamara, setFalloCamara] = useState(false);
  const [estadoTexto, setEstadoTexto] = useState<"error" | "ilegible" | null>(null);
  const alCodigo = useRef(onCodigo);
  const alError = useRef(onError);
  const detenerLectura = useRef(pausado);
  useEffect(() => { alCodigo.current = onCodigo; alError.current = onError; detenerLectura.current = pausado; });

  useEffect(() => {
    const v = video.current;
    if (!activa || !v) return;
    let flujo: MediaStream | null = null;
    let temporizador = 0;
    let cancelado = false;
    const peticiones = new AbortController();
    const Ctor = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    let detector: Detector | null = null;
    try { if (Ctor) detector = new Ctor({ formats: ["qr_code"] }); } catch { /* pruebe jsQR */ }
    const lienzo = document.createElement("canvas");
    const leer = async (): Promise<string> => {
      if (detector) {
        try { return (await detector.detect(v))[0]?.rawValue || ""; } catch { /* pruebe jsQR */ }
      }
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
    let leyendoTexto = false;
    let ultimoIntento = 0;
    let revisionQr = 0;
    let qrVisible = "";
    let sinQrDesde: number | null = null;
    const ultimos = { qr: { valor: "", momento: 0 }, credencial: { valor: "", momento: 0 } };
    const entregar = (valor: string, origen: keyof typeof ultimos) => {
      if (!valor || cancelado || detenerLectura.current) return;
      const ahora = Date.now();
      const ultimo = ultimos[origen];
      if (valor === ultimo.valor && ahora - ultimo.momento < 3000) return;
      ultimos[origen] = { valor, momento: ahora };
      alCodigo.current(valor, origen);
    };
    const camara = navigator.mediaDevices?.getUserMedia?.({ video: tokenPuerta
      ? { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
      : { facingMode: "environment" } }) ?? Promise.reject(new Error("Cámara no disponible"));
    camara.then(async (m) => {
      if (cancelado) { m.getTracks().forEach((t) => t.stop()); return; }
      flujo = m;
      v.srcObject = m;
      await v.play();
      if (cancelado) return;
      temporizador = window.setInterval(() => {
        if (ocupado || detenerLectura.current) return;
        ocupado = true;
        void leer().then((valor) => {
          if (cancelado || detenerLectura.current) return;
          if (valor) {
            setEstadoTexto(null);
            revisionQr++;
            sinQrDesde = null;
            if (tokenPuerta && qrVisible === valor) return;
            qrVisible = valor;
            entregar(valor, "qr");
            return;
          }
          // Dé tiempo a que salga del recuadro. Un solo fotograma borroso no libera el mismo QR.
          if (tokenPuerta && qrVisible) {
            const ahora = Date.now();
            sinQrDesde ??= ahora;
            if (ahora - sinQrDesde < 2000) return;
            qrVisible = "";
          }
          if (!tokenPuerta || !marco.current || leyendoTexto || Date.now() - ultimoIntento < 2000) return;
          leyendoTexto = true;
          const revision = revisionQr;
          void leerCredencialImpresa(v, marco.current, tokenPuerta, peticiones.signal).then((texto) => {
            // Un QR detectado mientras se leía el texto tiene prioridad.
            if (cancelado || detenerLectura.current || revision !== revisionQr) return;
            setEstadoTexto(texto ? null : "ilegible");
            entregar(texto, "credencial");
          }).catch(() => {
            if (!cancelado && !detenerLectura.current && revision === revisionQr) setEstadoTexto("error");
          }).finally(() => {
            ultimoIntento = Date.now();
            leyendoTexto = false;
          });
        }).catch(() => undefined).finally(() => { ocupado = false; });
      }, detector ? 500 : 300);
    }).catch(() => {
      if (cancelado) return;
      setFalloCamara(true);
      setActiva(false);
      alError.current?.();
    });
    return () => {
      cancelado = true;
      peticiones.abort();
      window.clearInterval(temporizador);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, [activa, tokenPuerta]);

  const altoVisor = "clamp(152px, 53svh, 420px)";
  const proporcion = medidas.ancho / medidas.alto;
  const textoGuia = estadoTexto === "error" ? "Lectura de texto no disponible. Use el ingreso manual."
    : estadoTexto === "ilegible" ? "Acerque la credencial o use el ingreso manual"
    : mensajeCredencial || "Centre la credencial completa o su QR";
  return (
    <div className={tokenPuerta ? "relative mx-auto w-full max-w-lg overflow-hidden rounded-xl border-2 border-stone-900 bg-black"
      : encuadre ? "relative mx-auto aspect-square max-h-[45vh] w-full max-w-[45vh] overflow-hidden border-2 border-stone-900 bg-black"
      : "relative overflow-hidden border-2 border-stone-900 bg-black"}
      style={tokenPuerta ? { height: altoVisor } : encuadre ? undefined : { minHeight: 240 }}>
      <video ref={video} playsInline muted className={encuadre ? "h-full w-full object-cover" : "h-full max-h-[60vh] w-full object-cover"} />
      {encuadre && activa && (
        <>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <div ref={marco} className="aspect-square w-[65%] border-[3px] border-[#f2b705] shadow-[0_0_0_999px_rgba(0,0,0,0.35)]"
              style={tokenPuerta ? { aspectRatio: proporcion, width: `min(88%, calc((${altoVisor} - 50px) * ${proporcion}))` } : undefined} />
          </div>
          <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-center text-xs font-medium text-white" role={tokenPuerta ? "status" : undefined}>{tokenPuerta ? textoGuia : "Encuadre el QR en el recuadro amarillo"}</p>
        </>
      )}
      {children}
      {!activa && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-slate-800 p-4 text-center text-white">
          {falloCamara && <p role="alert">No se pudo usar la cámara. Revise el permiso de la cámara.</p>}
          <button onClick={() => { unlockAudio(); const disponible = !!navigator.mediaDevices?.getUserMedia; setFalloCamara(!disponible); setActiva(disponible); }} className="bg-white px-6 py-4 text-xl text-stone-900">Activar cámara</button>
        </div>
      )}
    </div>
  );
}
