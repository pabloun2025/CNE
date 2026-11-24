"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LectorQr } from "@/components/lector-qr";
import { feedback, unlockAudio } from "@/components/sonidos";
import type { MedidasCredencial } from "@/domain/credencial-layout";
import { formatoPublicoJunta, ZONA_HEX, ZONA_NOMBRE, ZONAS } from "@/domain/juntas";
import { COLOR_LECTURA, tonoLectura } from "@/domain/puerta-aviso";
import { cedulaManualValida } from "@/domain/puerta-nombre";
import type { Coincidencia, Lectura } from "@/server/puerta";

type Pantalla = Lectura | { resultado: "error" };
type Contadores = { total: number; esteEnlace: number };
type ModoManual = "cedula" | "nombre";
type Origen = "qr" | "credencial" | ModoManual;

function Aviso({ p, origen }: { p: Pantalla; origen: Origen }) {
  if (p.resultado === "valido") {
    const zona = ZONAS.find((clave) => ZONA_NOMBRE[clave] === p.zona);
    return (
      <>
        <p className="text-3xl font-extrabold leading-none"><span aria-hidden="true">✓ </span><span>OK</span></p>
        <p className="font-semibold">Ingreso registrado</p>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <p className="text-2xl font-bold leading-tight">Junta {formatoPublicoJunta(p.junta)}</p>
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 font-semibold text-slate-900">
            {zona && <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border border-black/15" style={{ backgroundColor: ZONA_HEX[zona] }} />}
            {p.zona}
          </span>
        </div>
        <p className="text-sm font-medium">{p.nombre}</p>
      </>
    );
  }
  if (p.resultado === "duplicado") return <p className="text-4xl font-extrabold leading-tight">Ya usada</p>;
  if (p.resultado === "desconocido") {
    if (origen === "cedula") return <><p className="text-3xl font-extrabold">Cédula no reconocida</p><p>Revise el número y vuelva a comprobarlo.</p></>;
    if (origen === "credencial") return <p className="text-3xl font-extrabold">No se encontró la credencial. Repita la lectura o ingrese la cédula.</p>;
    return <p className="text-4xl font-extrabold leading-tight">{origen === "nombre" ? "No está en la lista" : "QR no reconocido"}</p>;
  }
  if (p.resultado === "ambiguo") return <><p className="text-3xl font-extrabold">Coincide con varias fichas</p><p>Escanee el QR o ingrese la cédula para identificar a la persona.</p></>;
  if (p.resultado === "bloqueado") return <><p className="text-2xl font-extrabold">Ingreso no autorizado</p><p>Dada de baja en la lista</p></>;
  if (p.resultado === "revocado") return <><p className="text-2xl font-extrabold">Ingreso no autorizado</p><p>Credencial revocada</p></>;
  return (<><p className="text-4xl font-extrabold leading-tight">No se pudo comprobar</p><p className="text-2xl">Repita la lectura.</p></>);
}

export function Puerta({ token, medidas }: { token: string; medidas: MedidasCredencial }) {
  const [pantalla, setPantalla] = useState<{ lectura: Pantalla; origen: Origen } | null>(null);
  const [encima, setEncima] = useState(false);
  const [cont, setCont] = useState<Contadores | null>(null);
  const [modoManual, setModoManual] = useState<ModoManual | null>(null);
  const [manual, setManual] = useState("");
  const [pendiente, setPendiente] = useState<{ codigo: string; ficha: Coincidencia } | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [mensajeCredencial, setMensajeCredencial] = useState("");
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
    fetch("/api/e/puerta", { headers: { authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setCont(d)).catch(() => undefined);
    const desbloquear = () => unlockAudio();
    window.addEventListener("pointerdown", desbloquear, { once: true });
    return () => {
      window.removeEventListener("pointerdown", desbloquear);
      window.clearTimeout(cierre.current);
    };
  }, [token]);

  useEffect(() => { if (modoManual) entrada.current?.focus(); }, [modoManual]);
  useEffect(() => { if (pendiente) tituloConfirmacion.current?.focus(); }, [pendiente]);

  const mostrar = useCallback((lectura: Pantalla, origen: Origen) => {
    setPantalla({ lectura, origen });
    setEncima(true);
    window.clearTimeout(cierre.current);
    // El lector espera mientras aparece la confirmación.
    const ms = lectura.resultado === "valido" ? 2500 : 6000;
    cierre.current = window.setTimeout(() => setEncima(false), ms);
  }, []);

  const enviar = useCallback(async (codigo: string, origen: Origen, confirmarId?: number) => {
    if (enCurso.current) return;
    enCurso.current = true;
    setProcesando(true);
    try {
      const r = await fetch("/api/e/puerta", {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ codigo, dispositivo: dispositivo.current, origen: origen === "qr" || origen === "nombre" ? "codigo" : origen, confirmarId }),
      });
      if (!r.ok) throw new Error("http");
      const { lectura, contadores } = (await r.json()) as { lectura: Lectura | Coincidencia; contadores: Contadores };
      setCont(contadores);
      if (lectura.resultado === "pendiente") {
        setMensajeCredencial("");
        setPantalla(null);
        setEncima(false);
        setPendiente({ codigo, ficha: lectura });
        return;
      }
      if (origen === "credencial" && !confirmarId && lectura.resultado === "desconocido") {
        setMensajeCredencial("Acerque la credencial o use el ingreso manual");
        return;
      }
      setMensajeCredencial("");
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
      if (origen === "credencial" && !confirmarId) setMensajeCredencial("No se pudo comprobar. Use el ingreso manual");
      else mostrar({ resultado: "error" }, origen);
    } finally {
      setProcesando(false);
      enCurso.current = false;
    }
  }, [mostrar, token]);

  function abrirManual(modo: ModoManual) {
    setManual("");
    setModoManual(modo);
    setPendiente(null);
    setPantalla(null);
    setEncima(false);
    setMensajeCredencial("");
  }

  const aviso = pantalla ? <Aviso p={pantalla.lectura} origen={pantalla.origen} /> : null;
  const valido = pantalla?.lectura.resultado === "valido";
  const color = pantalla ? COLOR_LECTURA[tonoLectura(pantalla.lectura.resultado)] : "";
  const puedeComprobar = modoManual === "cedula" ? cedulaManualValida(manual) : !!manual.trim();
  return (
    <div className="mx-auto max-w-xl space-y-3">
      <p className="cifra text-center text-2xl font-bold" aria-live="polite">Ingresos: {cont?.total ?? "—"} <span className="block text-base font-semibold">Este puesto: {cont?.esteEnlace ?? "—"}</span></p>
      <div className="grid grid-cols-2 gap-2">
        <button ref={botonManual} type="button" aria-expanded={modoManual === "cedula"} aria-controls="ingreso-manual" className="rounded-lg border border-stone-500 px-2 py-2 font-semibold leading-tight" disabled={procesando} onClick={() => abrirManual("cedula")}>Ingreso manual por cédula</button>
        <button type="button" aria-expanded={modoManual === "nombre"} aria-controls="ingreso-manual" className="px-2 py-2 leading-tight underline" disabled={procesando} onClick={() => abrirManual("nombre")}>Ingreso por nombre</button>
      </div>
      {modoManual && (encima || !valido) && aviso && (
        <div role={valido ? "status" : "alert"} className={`rounded-xl p-3 text-center ${color}`}>{aviso}</div>
      )}
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
      {pendiente && (
        <section className="space-y-2 border border-stone-300 bg-white p-4" aria-labelledby="confirmacion-credencial">
          <h2 id="confirmacion-credencial" ref={tituloConfirmacion} tabIndex={-1} className="font-bold">Compruebe la ficha antes de registrar el ingreso</h2>
          <p className="text-lg font-bold">{pendiente.ficha.nombre}</p>
          <p>Cédula {pendiente.ficha.cedula} · Junta {formatoPublicoJunta(pendiente.ficha.junta)}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="bg-stone-900 px-4 py-2 text-white" disabled={procesando} onClick={() => void enviar(pendiente.codigo, "credencial", pendiente.ficha.mjrvId)}>Confirmar ingreso</button>
            <button type="button" className="border border-stone-400 px-4 py-2" disabled={procesando} onClick={() => { setPendiente(null); botonManual.current?.focus(); }}>Cancelar</button>
          </div>
        </section>
      )}
      <LectorQr encuadre tokenPuerta={token} medidas={medidas} mensajeCredencial={mensajeCredencial} pausado={encima || !!modoManual || !!pendiente || procesando} onCodigo={(c, origen) => { if (!modoManual && !pendiente) void enviar(c, origen); }}>
        {!modoManual && encima && aviso && (
          <div role={valido ? "status" : "alert"} className={`absolute inset-0 z-40 flex flex-col items-center justify-center gap-1 overflow-y-auto p-3 text-center ${color}`}>{aviso}</div>
        )}
      </LectorQr>
      {!modoManual && !encima && !valido && aviso && <div className={`rounded-xl p-4 text-center ${color}`}>{aviso}</div>}
    </div>
  );
}
