"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LectorQr } from "@/components/lector-qr";
import { feedback, unlockAudio } from "@/components/sonidos";
import { COLOR_LECTURA, tonoLectura } from "@/domain/puerta-aviso";
import { cedulaManualValida } from "@/domain/puerta-nombre";
import type { Coincidencia, Lectura } from "@/server/puerta";

type Pantalla = Lectura | { resultado: "error" };
type Contadores = { total: number; esteEnlace: number };
type ModoManual = "cedula" | "nombre";
type Origen = "qr" | "credencial" | ModoManual;

function Aviso({ p, origen }: { p: Pantalla; origen: Origen }) {
  if (p.resultado === "valido") return (<><p className="text-4xl font-extrabold leading-tight">Válida</p><p className="text-2xl font-bold leading-tight">{p.nombre}</p><p className="text-2xl leading-tight">{p.junta} · {p.zona}</p></>);
  if (p.resultado === "duplicado") return <p className="text-4xl font-extrabold leading-tight">Ya usada</p>;
  if (p.resultado === "desconocido") {
    if (origen === "cedula") return <><p className="text-3xl font-extrabold">Cédula no reconocida</p><p>Revise el número y vuelva a comprobarlo.</p></>;
    if (origen === "credencial") return <p className="text-3xl font-extrabold">No se encontró la credencial. Repita la lectura o ingrese la cédula.</p>;
    return <p className="text-4xl font-extrabold leading-tight">{origen === "nombre" ? "No está en la lista" : "QR no reconocido"}</p>;
  }
  if (p.resultado === "ambiguo") return <><p className="text-3xl font-extrabold">Coincide con varias fichas</p><p>Escanee el QR o ingrese la cédula para identificar a la persona.</p></>;
  if (p.resultado === "bloqueado") return <p className="text-4xl font-extrabold leading-tight">Dada de baja en la lista</p>;
  if (p.resultado === "revocado") return <p className="text-4xl font-extrabold leading-tight">Credencial revocada</p>;
  return (<><p className="text-4xl font-extrabold leading-tight">No se pudo comprobar</p><p className="text-2xl">Repita la lectura.</p></>);
}

export function Puerta() {
  const [pantalla, setPantalla] = useState<{ lectura: Pantalla; origen: Origen } | null>(null);
  const [encima, setEncima] = useState(false);
  const [cont, setCont] = useState<Contadores | null>(null);
  const [modoManual, setModoManual] = useState<ModoManual | null>(null);
  const [manual, setManual] = useState("");
  const [pendiente, setPendiente] = useState<{ codigo: string; ficha: Coincidencia } | null>(null);
  const [procesando, setProcesando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const tituloConfirmacion = useRef<HTMLHeadingElement>(null);
  const botonManual = useRef<HTMLButtonElement>(null);
  const enCurso = useRef(false);
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
    return () => {
      window.removeEventListener("pointerdown", desbloquear);
      window.clearTimeout(cierre.current);
    };
  }, []);

  useEffect(() => { if (modoManual) entrada.current?.focus(); }, [modoManual]);
  useEffect(() => { if (pendiente) tituloConfirmacion.current?.focus(); }, [pendiente]);

  const mostrar = useCallback((lectura: Pantalla, origen: Origen) => {
    setPantalla({ lectura, origen });
    setEncima(true);
    window.clearTimeout(cierre.current);
    // El color tapa el visor un momento (como teinvito) y el recuadro de abajo se queda hasta la siguiente lectura.
    const ms = lectura.resultado === "valido" ? 3500 : 6000;
    cierre.current = window.setTimeout(() => setEncima(false), ms);
  }, []);

  const enviar = useCallback(async (codigo: string, origen: Origen, confirmarId?: number) => {
    if (enCurso.current) return;
    enCurso.current = true;
    setProcesando(true);
    try {
      const r = await fetch("/api/e/puerta", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ codigo, dispositivo: dispositivo.current, origen: origen === "qr" || origen === "nombre" ? "codigo" : origen, confirmarId }),
      });
      if (!r.ok) throw new Error("http");
      const { lectura, contadores } = (await r.json()) as { lectura: Lectura | Coincidencia; contadores: Contadores };
      setCont(contadores);
      if (lectura.resultado === "pendiente") {
        setPantalla(null);
        setEncima(false);
        setPendiente({ codigo, ficha: lectura });
        return;
      }
      if (origen === "credencial" && !confirmarId && lectura.resultado === "desconocido") return;
      setPendiente(null);
      if (origen === "cedula" || origen === "nombre") {
        if (lectura.resultado === "desconocido" || lectura.resultado === "ambiguo") entrada.current?.select();
        else { setManual(""); entrada.current?.focus(); }
      }
      const tono = tonoLectura(lectura.resultado);
      if (tono === "valido") feedback("valido");
      else if (tono === "rechazo") feedback("rechazo");
      mostrar(lectura, origen);
    } catch {
      if (origen !== "credencial" || confirmarId) mostrar({ resultado: "error" }, origen);
    } finally {
      setProcesando(false);
      enCurso.current = false;
    }
  }, [mostrar]);

  function abrirManual(modo: ModoManual) {
    setManual("");
    setModoManual(modo);
    setPendiente(null);
    setPantalla(null);
    setEncima(false);
  }

  const aviso = pantalla ? <Aviso p={pantalla.lectura} origen={pantalla.origen} /> : null;
  const color = pantalla ? COLOR_LECTURA[tonoLectura(pantalla.lectura.resultado)] : "";
  const puedeComprobar = modoManual === "cedula" ? cedulaManualValida(manual) : !!manual.trim();
  return (
    <div className="mx-auto max-w-xl space-y-3">
      <p className="cifra text-center text-2xl font-bold" aria-live="polite">Ingresos: {cont?.total ?? "—"} <span className="block text-base font-semibold">Este puesto: {cont?.esteEnlace ?? "—"}</span></p>
      <LectorQr encuadre leerCredencial pausado={!!modoManual || !!pendiente || procesando} onCodigo={(c, origen) => { if (!modoManual && !pendiente) void enviar(c, origen); }}>
        {encima && aviso && <div aria-hidden="true" className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-1 overflow-y-auto p-3 text-center ${color}`}>{aviso}</div>}
      </LectorQr>
      {pantalla && <div role="alert" className={`p-4 text-center ${color}`}>{aviso}</div>}
      {pendiente && (
        <section className="space-y-2 border border-stone-300 bg-white p-4" aria-labelledby="confirmacion-credencial">
          <h2 id="confirmacion-credencial" ref={tituloConfirmacion} tabIndex={-1} className="font-bold">Compruebe la ficha antes de registrar el ingreso</h2>
          <p className="text-lg font-bold">{pendiente.ficha.nombre}</p>
          <p>Cédula {pendiente.ficha.cedula} · Junta {pendiente.ficha.junta}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="bg-stone-900 px-4 py-2 text-white" disabled={procesando} onClick={() => void enviar(pendiente.codigo, "credencial", pendiente.ficha.mjrvId)}>Confirmar ingreso</button>
            <button type="button" className="border border-stone-400 px-4 py-2" disabled={procesando} onClick={() => { setPendiente(null); botonManual.current?.focus(); }}>Cancelar</button>
          </div>
        </section>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button ref={botonManual} type="button" aria-expanded={modoManual === "cedula"} aria-controls="ingreso-manual" className="border border-stone-500 px-4 py-2 font-semibold" disabled={procesando} onClick={() => abrirManual("cedula")}>Ingreso manual por cédula</button>
        <button type="button" aria-expanded={modoManual === "nombre"} aria-controls="ingreso-manual" className="px-3 py-2 underline" disabled={procesando} onClick={() => abrirManual("nombre")}>Ingreso por nombre</button>
      </div>
      <form id="ingreso-manual" hidden={!modoManual} onSubmit={(e) => {
        e.preventDefault();
        if (modoManual && puedeComprobar) void enviar(manual, modoManual);
      }}>
        <label htmlFor="identidad-manual" className="font-semibold">{modoManual === "cedula" ? "Número de cédula" : "Nombres y apellidos"}</label>
        <div className="mt-1 flex flex-wrap gap-2">
          <input ref={entrada} id="identidad-manual" value={manual} onChange={(e) => setManual(modoManual === "cedula" ? e.target.value.replace(/\D/g, "") : e.target.value)} inputMode={modoManual === "cedula" ? "numeric" : "text"} maxLength={modoManual === "cedula" ? 20 : 120} autoComplete="off" readOnly={procesando} className="min-w-0 flex-1" />
          <button className="bg-stone-900 px-4 py-2 text-white" disabled={procesando || !puedeComprobar}>Comprobar</button>
          <button type="button" className="px-3 py-2 underline" disabled={procesando} onClick={() => { setModoManual(null); botonManual.current?.focus(); }}>Volver al lector</button>
        </div>
      </form>
    </div>
  );
}
