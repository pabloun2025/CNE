"use client";

import { useEffect, useState } from "react";

type Pendiente = { id: number; junta: string; nombre: string };

export function ModuloImpresion() {
  const [modo, setModo] = useState<"impresion" | "digital">("impresion");
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [aviso, setAviso] = useState("");

  const cargar = async () => {
    const [m, p] = await Promise.all([
      fetch("/api/admin/finanzas/modo").then((r) => r.json()).catch(() => null),
      fetch("/api/admin/finanzas/pendientes").then((r) => r.json()).catch(() => null),
    ]);
    if (m?.modo === "digital" || m?.modo === "impresion") setModo(m.modo);
    if (Array.isArray(p?.pendientes)) setPendientes(p.pendientes);
  };

  useEffect(() => {
    let vivo = true;
    const tick = () => { if (vivo) void cargar(); };
    tick();
    const id = window.setInterval(tick, 2000);
    return () => { vivo = false; window.clearInterval(id); };
  }, []);

  const activar = async (siguiente: "impresion" | "digital") => {
    await fetch("/api/admin/finanzas/modo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ modo: siguiente }) });
    setModo(siguiente);
  };

  const imprimir = async (item: Pendiente) => {
    setAviso("");
    const r = await fetch("/api/admin/finanzas/imprimir", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id }) });
    if (!r.ok) { setAviso((await r.json()).error ?? "No se pudo imprimir."); return; }
    const url = URL.createObjectURL(await r.blob());
    const marco = document.createElement("iframe");
    marco.setAttribute("title", `Acta ${item.junta}`);
    marco.style.position = "fixed";
    marco.style.left = "-10000px";
    marco.src = url;
    marco.onload = () => marco.contentWindow?.print();
    document.body.appendChild(marco);
    setPendientes((lista) => lista.filter((x) => x.id !== item.id));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void activar("impresion")} className={modo === "impresion" ? "bg-stone-900 px-4 py-3 text-white" : "border-2 border-stone-900 px-4 py-3"}>Impresión</button>
        <button type="button" onClick={() => void activar("digital")} className={modo === "digital" ? "bg-stone-900 px-4 py-3 text-white" : "border-2 border-stone-900 px-4 py-3"}>Digital</button>
      </div>
      <p className="text-sm">{modo === "digital" ? "Quien escanea firma con el dedo. El pago no queda confirmado." : "Quien escanea deja aquí un icono. Al pulsarlo se imprime el acta."}</p>
      {aviso && <p role="alert" className="font-semibold text-red-700">{aviso}</p>}
      <div className="flex flex-wrap gap-3">
        {pendientes.map((p) => (
          <button key={p.id} type="button" onClick={() => void imprimir(p)} className="w-36 border-2 border-stone-900 px-3 py-4 text-center">
            <span className="block text-sm font-semibold">Pendientes de imprimir</span>
            <span className="mt-1 block text-2xl font-bold">{p.junta}</span>
            <span className="mt-1 block text-xs">{p.nombre}</span>
          </button>
        ))}
        {pendientes.length === 0 && <p>No hay actas pendientes de imprimir.</p>}
      </div>
      {modo === "digital" && <a href="/api/admin/finanzas/lote" className="inline-block border-2 border-stone-900 px-4 py-3 font-semibold">Descargar lote</a>}
    </div>
  );
}
