"use client";

import { useEffect, useState, useTransition } from "react";
import type { LineaWhatsApp } from "@/server/whatsapp-linea";
import { crearLineaAccion, desvincularLineaAccion, type EstadoSuper } from "@/server/superadmin-actions";

const TEXTO: Record<LineaWhatsApp["estado"], string> = {
  sin_crear: "Sin crear", esperando_qr: "Esperando que escanee el código", vinculada: "Vinculada", desconectada: "Desconectada",
};

// Línea de WhatsApp de CNE (instancia cne-madrid). El código QR se renueva cada 3 s mientras se espera la vinculación.
export function LineaWhatsAppPanel({ inicial }: { inicial: LineaWhatsApp }) {
  const [linea, setLinea] = useState<LineaWhatsApp>(inicial);
  const [resultado, setResultado] = useState<EstadoSuper>(null);
  const [pendiente, iniciar] = useTransition();
  const esperando = linea.estado === "esperando_qr";

  useEffect(() => {
    if (!esperando) return;
    let vivo = true;
    const id = window.setInterval(async () => {
      try {
        const r = await fetch("/api/superadmin/whatsapp/estado?qr=1", { cache: "no-store" });
        if (r.ok && vivo) setLinea((await r.json()) as LineaWhatsApp);
      } catch { /* se reintenta en 3 s */ }
    }, 3000);
    return () => { vivo = false; window.clearInterval(id); };
  }, [esperando]);

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
      <p>Estado: <strong>{TEXTO[linea.estado]}</strong>{linea.estado === "vinculada" && linea.numero ? ` con ${linea.numero}` : ""}.</p>
      {linea.simulada && <p className="rounded bg-amber-100 p-2 text-sm font-medium text-amber-900">Modo simulado: no hay claves de Evolution API en este servidor. El código no vincula ninguna cuenta real.</p>}
      {linea.error && <p role="alert" className="text-sm font-medium text-red-700">{linea.error}</p>}
      {linea.estado === "esperando_qr" && !linea.qr && !linea.error && (
        <p className="text-sm">El código se está preparando. Si no aparece, pulse Crear y vincular otra vez.</p>
      )}
      {linea.estado === "esperando_qr" && linea.qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={linea.qr} alt="Código QR para vincular la línea de WhatsApp de CNE" width={264} height={264} className="rounded bg-white p-2" />
      )}
      <div className="flex flex-wrap gap-2">
        {linea.estado !== "vinculada" && <button onClick={crear} disabled={pendiente} className="rounded bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60">Crear y vincular</button>}
        {linea.estado !== "sin_crear" && <button onClick={quitar} disabled={pendiente} className="rounded border border-red-700 px-4 py-3 font-semibold text-red-700 disabled:opacity-60">Desvincular</button>}
      </div>
      {resultado?.error && <p role="alert" className="text-sm font-medium text-red-700">{resultado.error}</p>}
      {resultado?.aviso && !resultado.error && <p role="status" className="text-sm font-medium text-green-800">{resultado.aviso}</p>}
    </div>
  );
}
