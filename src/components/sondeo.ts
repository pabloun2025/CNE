"use client";

import { useEffect, useState } from "react";

// Sondeo JSON con setInterval (patrón de teinvito/live-board). Si una petición falla sigue intentándolo
// y informa de la última vez que funcionó.
export function useSondeo<T>(url: string, ms: number): { datos: T | null; ultima: Date | null; falla: boolean; refrescar: () => void } {
  const [estado, setEstado] = useState<{ datos: T | null; ultima: Date | null; falla: boolean }>({ datos: null, ultima: null, falla: false });
  const [tic, setTic] = useState(0);
  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const datos = (await r.json()) as T;
        if (vivo) setEstado({ datos, ultima: new Date(), falla: false });
      } catch {
        if (vivo) setEstado((e) => ({ ...e, falla: true }));
      }
    };
    void cargar();
    const t = window.setInterval(cargar, ms);
    return () => { vivo = false; window.clearInterval(t); };
  }, [url, ms, tic]);
  return { ...estado, refrescar: () => setTic((n) => n + 1) };
}

export const horaCorta = (d: Date) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Madrid" });
