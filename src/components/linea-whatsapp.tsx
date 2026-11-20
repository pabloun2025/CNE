"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LineaWhatsApp } from "@/server/whatsapp-linea";
import { crearLineaAccion, desvincularLineaAccion, type EstadoSuper } from "@/server/superadmin-actions";

const TEXTO: Record<LineaWhatsApp["estado"], string> = {
  sin_crear: "Sin vincular", esperando_qr: "Esperando que escanee el código", vinculada: "Vinculada", desconectada: "Desconectada",
};

// Línea de WhatsApp de CNE (instancia cne-madrid). El código QR se renueva cada 3 s mientras se espera la vinculación.
export function LineaWhatsAppPanel({ inicial, rutaEstado }: { inicial: LineaWhatsApp; rutaEstado: string }) {
  const router = useRouter();
  const [linea, setLinea] = useState<LineaWhatsApp>(inicial);
  const [resultado, setResultado] = useState<EstadoSuper>(null);
  const [pendiente, iniciar] = useTransition();
  const esperando = linea.estado === "esperando_qr";

  useEffect(() => {
    if (!esperando || pendiente) return;
    let vivo = true;
    let id: number;
    const abortar = new AbortController();
    const consultar = async () => {
      try {
        const r = await fetch(`${rutaEstado}?qr=1`, { cache: "no-store", signal: abortar.signal });
        if (r.ok) {
          const actual = await r.json() as LineaWhatsApp;
          if (vivo) {
            setLinea(actual);
            if (actual.estado === "vinculada") router.refresh();
          }
        }
      } catch { /* se reintenta cuando termina esta consulta */ }
      if (vivo) id = window.setTimeout(consultar, 3000);
    };
    id = window.setTimeout(consultar, 3000);
    return () => { vivo = false; abortar.abort(); window.clearTimeout(id); };
  }, [esperando, pendiente, router, rutaEstado]);

  const crear = () => iniciar(async () => {
    const r = await crearLineaAccion();
    setResultado(r);
    if (r?.error) return;
    if (r?.qr) setLinea((l) => ({ ...l, estado: "esperando_qr", qr: r.qr ?? null, error: undefined }));
    else if (r?.vinculada) setLinea((l) => ({ ...l, estado: "vinculada", qr: null, error: undefined }));
    else if (r?.aviso) setLinea((l) => ({ ...l, estado: "esperando_qr", qr: null, error: undefined }));
  });
  const quitar = () => {
    if (!window.confirm("¿Desvincular la línea de WhatsApp de CNE? El envío real por WhatsApp quedará apagado.")) return;
    iniciar(async () => {
      const r = await desvincularLineaAccion();
      setResultado(r);
      if (r?.aviso) setLinea((l) => ({ ...l, estado: "desconectada", numero: null, qr: null }));
    });
  };

  return (
    <div className="space-y-3">
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div><dt>Evolution API</dt><dd className="font-semibold">{linea.simulada ? "Sin configurar" : linea.error ? "Comprobación fallida" : "Disponible"}</dd></div>
        <div><dt>Línea de WhatsApp</dt><dd className="font-semibold">{TEXTO[linea.estado]}{linea.estado === "vinculada" && linea.numero ? ` con ${linea.numero}` : ""}</dd></div>
      </dl>
      {linea.simulada && <p className="rounded bg-amber-100 p-2 text-sm font-medium text-amber-900">La configuración actual genera un código QR de prueba.</p>}
      {linea.error && <p role="alert" className="text-sm font-medium text-red-700">{linea.error}</p>}
      {linea.estado === "esperando_qr" && !linea.qr && !linea.error && (
        <p role="status">Preparando el código QR…</p>
      )}
      {linea.estado === "esperando_qr" && linea.qr && (
        <div className="stack">
          <p>En el teléfono de CNE, abra WhatsApp y vaya a <strong>Dispositivos vinculados → Vincular un dispositivo</strong>. Escanee este código.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={linea.qr} alt="Código QR de vinculación de WhatsApp" width={264} height={264} className="max-w-full rounded bg-white p-2" />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {linea.estado !== "vinculada" && <button onClick={crear} disabled={pendiente} className="rounded bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60">{pendiente ? "Conectando…" : esperando ? "Renovar código QR" : "Vincular teléfono"}</button>}
        {linea.estado !== "sin_crear" && <button onClick={quitar} disabled={pendiente} className="rounded border border-red-700 px-4 py-3 font-semibold text-red-700 disabled:opacity-60">Desvincular</button>}
      </div>
      {resultado?.error && <p role="alert" className="text-sm font-medium text-red-700">{resultado.error}</p>}
      {resultado?.aviso && !resultado.error && <p role="status" className="text-sm font-medium text-green-800">{resultado.aviso}</p>}
    </div>
  );
}
