"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LectorQr } from "@/components/lector-qr";
import { feedback, unlockAudio } from "@/components/sonidos";

type Lectura =
  | { resultado: "valido"; nombre: string; junta: string; zona: string }
  | { resultado: "duplicado"; desde: string; mjrvId: number; nombre: string; junta: string }
  | { resultado: "desconocido" }
  | { resultado: "bloqueado" };
type Pantalla = Lectura | { resultado: "error" };
type Contadores = { total: number; esteEnlace: number };

export function Puerta() {
  const [pantalla, setPantalla] = useState<Pantalla | null>(null);
  const [cont, setCont] = useState<Contadores | null>(null);
  const [manual, setManual] = useState("");
  const dispositivo = useRef("");
  const cierre = useRef(0);

  useEffect(() => {
    try {
      dispositivo.current = localStorage.getItem("cne-dispositivo") || crypto.randomUUID();
      localStorage.setItem("cne-dispositivo", dispositivo.current);
    } catch { /* sin almacenamiento */ }
    fetch("/api/e/puerta").then((r) => (r.ok ? r.json() : null)).then((d) => d && setCont(d)).catch(() => undefined);
    const desbloquear = () => unlockAudio();
    window.addEventListener("pointerdown", desbloquear, { once: true });
    return () => window.removeEventListener("pointerdown", desbloquear);
  }, []);

  const mostrar = useCallback((p: Pantalla) => {
    setPantalla(p);
    window.clearTimeout(cierre.current);
    // El resultado se queda 1,5 s y vuelve solo a la lectura.
    cierre.current = window.setTimeout(() => setPantalla(null), 1500);
  }, []);

  const enviar = useCallback(async (codigo: string) => {
    try {
      const r = await fetch("/api/e/puerta", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codigo, dispositivo: dispositivo.current }) });
      if (!r.ok) throw new Error("http");
      const d = (await r.json()) as { lectura: Lectura; contadores: Contadores };
      setCont(d.contadores);
      feedback(d.lectura.resultado === "valido" ? "valido" : "rechazo");
      mostrar(d.lectura);
    } catch {
      // Un fallo de red o de servidor es un error de operación, no un rechazo de identidad.
      mostrar({ resultado: "error" });
    }
  }, [mostrar]);

  const color = !pantalla ? "" : pantalla.resultado === "valido" ? "bg-green-700" : pantalla.resultado === "error" ? "bg-slate-600" : "bg-red-700";
  return (
    <div className="mx-auto max-w-xl space-y-3">
      <p className="text-center text-lg font-semibold" aria-live="polite">Ingresos: {cont?.total ?? "—"} <span className="font-normal text-slate-600">(este puesto: {cont?.esteEnlace ?? "—"})</span></p>
      <LectorQr onCodigo={enviar} onError={() => mostrar({ resultado: "error" })} />
      <form onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { void enviar(manual); setManual(""); } }} className="flex gap-2">
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Escribir cédula" inputMode="text" autoComplete="off" className="min-w-0 flex-1 rounded border border-slate-400 px-3 py-3 text-lg" />
        <button className="rounded bg-slate-800 px-5 py-3 font-semibold text-white">Comprobar</button>
      </form>
      {pantalla && (
        <div role="alert" className={`fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 p-6 text-center text-white ${color}`}>
          {pantalla.resultado === "valido" && (<><p className="text-5xl font-extrabold">Válida</p><p className="text-3xl font-bold">{pantalla.nombre}</p><p className="text-3xl">{pantalla.junta} · {pantalla.zona}</p></>)}
          {pantalla.resultado === "duplicado" && <p className="text-4xl font-extrabold">Ya usada</p>}
          {pantalla.resultado === "desconocido" && <p className="text-4xl font-extrabold">QR no reconocido</p>}
          {pantalla.resultado === "bloqueado" && <p className="text-4xl font-extrabold">Dada de baja en la lista</p>}
          {pantalla.resultado === "error" && (<><p className="text-4xl font-extrabold">No se pudo comprobar</p><p className="text-2xl">Repita la lectura.</p></>)}
        </div>
      )}
    </div>
  );
}
