"use client";

import { useEffect, useRef, useState } from "react";
import { type EstadoDocs, type LadoDocumento, type TipoDocumento } from "@/domain/documentos";

const ID1 = 85.6 / 54;
const PAGINA_PASAPORTE = 125 / 88;
const MAX_PX = 1600;

export type EstadoFotos = Omit<EstadoDocs, "completos">;
export const ROTULO_FOTO = { anverso: "Anverso (la cara con su foto)", reverso: "Reverso (la otra cara)", pasaporte: "Página de datos del pasaporte (la página con su foto)" };

function aBlob(origen: CanvasImageSource, x: number, y: number, ancho: number, alto: number): Promise<Blob | null> {
  const escala = Math.min(1, MAX_PX / Math.max(ancho, alto));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(ancho * escala));
  canvas.height = Math.max(1, Math.round(alto * escala));
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  ctx.drawImage(origen, x, y, ancho, alto, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}

export function CapturaCedula({ rotulo, onUsar, documento = "cedula", onVolver }: {
  rotulo: string;
  onUsar: (imagen: Blob) => boolean | void | Promise<boolean | void>;
  documento?: TipoDocumento;
  onVolver?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [sinCamara, setSinCamara] = useState(false);
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const [previa, setPrevia] = useState<{ blob: Blob; url: string } | null>(null);
  const [ocupada, setOcupada] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let flujo: MediaStream | undefined;
    let vivo = true;
    const v = video.current;
    const fallo = () => { if (vivo) setSinCamara(true); };

    async function abrir() {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } } });
        if (!vivo || !v) { flujo.getTracks().forEach((t) => t.stop()); return; }
        flujo.getVideoTracks().forEach((t) => t.addEventListener("ended", fallo));
        v.srcObject = flujo;
        await v.play();
      } catch { fallo(); }
    }

    void abrir();
    return () => {
      vivo = false;
      flujo?.getTracks().forEach((t) => {
        t.removeEventListener("ended", fallo);
        t.stop();
      });
      if (v) v.srcObject = null;
    };
  }, []);

  useEffect(() => {
    const url = previa?.url;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [previa]);

  useEffect(() => {
    const v = video.current;
    if (!previa && v?.srcObject && v.paused) {
      void v.play().catch(() => { if (video.current === v) setSinCamara(true); });
    }
  }, [previa]);

  const lista = dim.w > 0 && dim.h > 0;
  const relacionDocumento = documento === "pasaporte" ? PAGINA_PASAPORTE : ID1;
  const ancho = Math.min(dim.w, dim.h * relacionDocumento) * 0.92;
  const alto = ancho / relacionDocumento;
  const x = (dim.w - ancho) / 2;
  const y = (dim.h - alto) / 2;

  const preparar = async (foto: () => Promise<Blob | null>) => {
    setOcupada(true);
    setError("");
    try {
      const blob = await foto();
      if (!blob) throw new Error();
      setPrevia({ blob, url: URL.createObjectURL(blob) });
    } catch { setError("No se pudo preparar la foto. Inténtelo de nuevo."); }
    finally { setOcupada(false); }
  };

  const tomar = () => {
    const v = video.current;
    if (v && lista && v.readyState >= 2) void preparar(() => aBlob(v, x, y, ancho, alto));
  };

  const usar = async () => {
    if (!previa) return;
    setOcupada(true);
    setError("");
    try {
      if ((await onUsar(previa.blob)) !== false) setPrevia(null);
    } catch { setError("No se pudo guardar la foto. Inténtelo de nuevo."); }
    finally { setOcupada(false); }
  };

  const relacion = lista ? dim.w / dim.h : 4 / 3;
  const marco = (r: number) => ({ width: `min(100%, calc((100dvh - 14rem) * ${r}))`, maxHeight: "calc(100dvh - 14rem)" });
  return (
    <div className="flex flex-col gap-2">
      {onVolver && <button type="button" disabled={ocupada} onClick={onVolver} className="secondary self-start border-2 border-stone-900 px-4 py-3">← Volver</button>}
      <p className="shrink-0 font-semibold">{rotulo}</p>
      {/* El vídeo sigue montado al previsualizar y al pasar a la otra cara. */}
      <div hidden={!!previa}>
        <div className="flex flex-col gap-2">
          {!sinCamara && (
            <div className="relative mx-auto w-full overflow-hidden rounded bg-black" style={{ aspectRatio: relacion, ...marco(relacion) }}>
              <video ref={video} playsInline muted className="h-full w-full object-cover"
                onLoadedData={(e) => setDim({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })} />
              {lista && <div aria-hidden className="absolute border-4 border-white shadow-[0_0_0_999px_rgba(0,0,0,0.45)]" style={{ left: `${x / dim.w * 100}%`, top: `${y / dim.h * 100}%`, width: `${ancho / dim.w * 100}%`, height: `${alto / dim.h * 100}%` }} />}
            </div>
          )}
          {sinCamara
            ? <p role="status" className="text-sm">Use el selector del teléfono para hacer o elegir la foto.</p>
            : <button type="button" onClick={tomar} disabled={!lista || ocupada} className="w-full bg-stone-900 px-4 py-4 text-lg text-white disabled:opacity-60">Tomar foto</button>}
          <label className="block w-full cursor-pointer border-2 border-stone-900 px-4 py-3 text-center">
            {sinCamara ? "Hacer o elegir foto" : "Elegir una foto del teléfono"}
            <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={ocupada}
              onChange={(e) => {
                const archivo = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (archivo) void preparar(async () => {
                  const mapa = await createImageBitmap(archivo);
                  try { return await aBlob(mapa, 0, 0, mapa.width, mapa.height); }
                  finally { mapa.close(); }
                });
              }} />
          </label>
        </div>
      </div>
      {previa && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previa.url} alt={`Vista previa · ${rotulo}`} className="mx-auto min-h-0 rounded border object-contain" style={marco(relacionDocumento)} />
          <div className="flex gap-3">
            <button type="button" disabled={ocupada} onClick={() => void usar()} className="flex-1 bg-green-800 px-4 py-4 text-lg text-white disabled:opacity-60">Usar esta foto</button>
            <button type="button" disabled={ocupada} onClick={() => setPrevia(null)} className="flex-1 border-2 border-stone-900 px-4 py-4 text-lg">Repetir</button>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </div>
  );
}

export function ElegirDocumento({ onElegir }: { onElegir: (tipo: TipoDocumento) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="font-semibold">¿Qué documento va a fotografiar?</legend>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onElegir("cedula")} className="border-2 border-stone-900 bg-stone-900 px-3 py-3 text-white">Cédula</button>
        <button type="button" onClick={() => onElegir("pasaporte")} className="border-2 border-stone-900 bg-stone-900 px-3 py-3 text-white">Pasaporte</button>
        <span className="text-center text-sm">Anverso y reverso</span>
        <span className="text-center text-sm">Página de datos, si no tiene la cédula física</span>
      </div>
    </fieldset>
  );
}

export function AvisoCambioDocumento({ tipo, fotos }: { tipo: TipoDocumento; fotos: EstadoFotos }) {
  if (tipo === "pasaporte" && (fotos.anverso || fotos.reverso)) {
    return <p role="note" className="font-medium text-amber-900">Al guardar el pasaporte, reemplazará las fotos de la cédula.</p>;
  }
  if (tipo === "cedula" && fotos.pasaporte) {
    return <p role="note" className="font-medium text-amber-900">Al guardar la primera foto de la cédula, reemplazará la foto del pasaporte.</p>;
  }
  return null;
}

export function CapturaDocumentosPuesto({ fotos, onUsar, seguirConReverso = false }: {
  fotos: EstadoFotos;
  onUsar: (lado: LadoDocumento, imagen: Blob) => Promise<boolean>;
  seguirConReverso?: boolean;
}) {
  const [tipo, setTipo] = useState<TipoDocumento | null>(null);
  const [lado, setLado] = useState<LadoDocumento | null>(null);

  if (!tipo) return <ElegirDocumento onElegir={(elegido) => {
    setTipo(elegido);
    if (elegido === "pasaporte") setLado("pasaporte");
  }} />;

  return (
    <div className="space-y-2">
      <AvisoCambioDocumento tipo={tipo} fotos={fotos} />
      {lado ? (
        <CapturaCedula rotulo={ROTULO_FOTO[lado]} documento={tipo} onVolver={() => {
          setLado(null);
          if (lado === "pasaporte") setTipo(null);
        }} onUsar={async (imagen) => {
          const guardada = await onUsar(lado, imagen);
          if (guardada) {
            setLado(seguirConReverso && lado === "anverso" && !fotos.reverso ? "reverso" : null);
            if (lado === "pasaporte") setTipo(null);
          }
          return guardada;
        }} />
      ) : (
        <>
          <button type="button" onClick={() => setTipo(null)} className="secondary border-2 border-stone-900 px-4 py-3">Cambiar tipo de documento</button>
          <div className="grid gap-2">
            {(["anverso", "reverso"] as const).map((cara) => (
              <button key={cara} type="button" onClick={() => setLado(cara)} className="bg-stone-900 px-4 py-3 text-white">{fotos[cara] ? "Sustituir" : "Fotografiar"} {cara}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
