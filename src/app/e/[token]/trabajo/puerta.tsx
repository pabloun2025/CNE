"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { LectorQr } from "@/components/lector-qr";
import { feedback, unlockAudio } from "@/components/sonidos";
import { COLOR_LECTURA, tonoLectura } from "@/domain/puerta-aviso";
import { pareceCedula } from "@/domain/puerta-nombre";

type Lectura =
  | { resultado: "valido"; nombre: string; junta: string; zona: string }
  | { resultado: "duplicado"; desde: string; mjrvId: number; nombre: string; junta: string }
  | { resultado: "desconocido" }
  | { resultado: "bloqueado" }
  | { resultado: "ambiguo" }
  | { resultado: "revocado" };
type Pantalla = Lectura | { resultado: "error" };
type Contadores = { total: number; esteEnlace: number };

function Aviso({ p, porNombre }: { p: Pantalla; porNombre: boolean }) {
  if (p.resultado === "valido") return (<><p className="text-4xl font-extrabold leading-tight">Válida</p><p className="text-2xl font-bold leading-tight">{p.nombre}</p><p className="text-2xl leading-tight">{p.junta} · {p.zona}</p></>);
  if (p.resultado === "duplicado") return <p className="text-4xl font-extrabold leading-tight">Ya usada</p>;
  if (p.resultado === "desconocido") return <p className="text-4xl font-extrabold leading-tight">{porNombre ? "No está en la lista" : "QR no reconocido"}</p>;
  if (p.resultado === "ambiguo") return <p className="text-3xl font-extrabold leading-tight">Hay varias personas. Escriba el nombre completo.</p>;
  if (p.resultado === "bloqueado") return <p className="text-4xl font-extrabold leading-tight">Dada de baja en la lista</p>;
  if (p.resultado === "revocado") return <p className="text-4xl font-extrabold leading-tight">Credencial revocada</p>;
  return (<><p className="text-4xl font-extrabold leading-tight">No se pudo comprobar</p><p className="text-2xl">Repita la lectura.</p></>);
}

export function Puerta() {
  const [pantalla, setPantalla] = useState<Pantalla | null>(null);
  const [encima, setEncima] = useState(false);
  const [cont, setCont] = useState<Contadores | null>(null);
  const [manual, setManual] = useState("");
  const [ultimo, setUltimo] = useState<{ origen: "qr" | "nombre" | "teclado"; codigo: string }>({ origen: "qr", codigo: "" });
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
    setEncima(true);
    window.clearTimeout(cierre.current);
    // El color tapa el visor un momento (como teinvito) y el recuadro de abajo se queda hasta la siguiente lectura.
    const ms = p.resultado === "valido" ? 3500 : 6000;
    cierre.current = window.setTimeout(() => setEncima(false), ms);
  }, []);

  const enviar = useCallback(async (codigo: string, origen: "qr" | "nombre" | "teclado" = "teclado") => {
    setUltimo({ origen, codigo });
    try {
      const r = await fetch("/api/e/puerta", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ codigo, dispositivo: dispositivo.current, origen: origen === "nombre" ? "nombre" : "codigo" }) });
      if (!r.ok) throw new Error("http");
      const d = (await r.json()) as { lectura: Lectura | null; contadores: Contadores };
      setCont(d.contadores);
      if (!d.lectura) return;
      const tono = tonoLectura(d.lectura.resultado);
      if (tono === "valido") feedback("valido");
      else if (tono === "rechazo") feedback("rechazo");
      mostrar(d.lectura);
    } catch {
      // Un fallo de red o de servidor es un error de operación, no un rechazo de identidad.
      // La cámara que no pudo leer no interrumpe: se teclea.
      if (origen !== "nombre") mostrar({ resultado: "error" });
    }
  }, [mostrar]);

  const aviso: ReactNode = pantalla ? <Aviso p={pantalla} porNombre={ultimo.origen === "teclado" && !pareceCedula(ultimo.codigo)} /> : null;
  const color = pantalla ? COLOR_LECTURA[tonoLectura(pantalla.resultado)] : "";
  return (
    <div className="mx-auto max-w-xl space-y-3">
      <p className="cifra text-center text-2xl font-bold" aria-live="polite">Ingresos: {cont?.total ?? "—"} <span className="block text-base font-semibold">Este puesto: {cont?.esteEnlace ?? "—"}</span></p>
      <LectorQr encuadre leerNombre onCodigo={(c, origen) => void enviar(c, origen ?? "qr")}>
        {encima && aviso && <div className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 overflow-y-auto p-3 text-center ${color}`}>{aviso}</div>}
      </LectorQr>
      {pantalla && <div role="alert" className={`p-4 text-center ${color}`}>{aviso}</div>}
      <form onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { void enviar(manual, "teclado"); setManual(""); } }} className="flex gap-2">
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Escribir nombre o cédula" aria-label="Nombre o cédula" inputMode="text" autoComplete="off" className="min-w-0 flex-1" />
        <button className="bg-stone-900 px-4 text-white">Comprobar</button>
      </form>
    </div>
  );
}
