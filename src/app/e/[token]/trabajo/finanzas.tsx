"use client";

import { useCallback, useState } from "react";
import { LectorQr } from "@/components/lector-qr";
import { Documentacion } from "./documentacion";

type Ficha = {
  mjrvId: number; cedula: string; nombre: string; cargo: string; juntaOrigen: string; juntaVigente: string; activo: boolean;
  anverso: boolean; reverso: boolean; documentosCompletos: boolean; parametrosCompletos: boolean; faltanParametros: string[]; importeEur: string | null;
  acta: { id: number; impresionN: number } | null; pago: { en: string; operador: string; importeEur: string; simulado: boolean } | null;
  estado: string; modoPrueba: boolean;
};
const hora = (t: string) => new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const Req = ({ ok, texto }: { ok: boolean; texto: string }) => <li className={ok ? "text-green-800" : "font-semibold text-red-700"}>{ok ? "✔" : "✘"} {texto}</li>;

export function Finanzas() {
  const [cedula, setCedula] = useState("");
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [verificado, setVerificado] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [capturar, setCapturar] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async (c: string) => {
    setMensaje("");
    try {
      const r = await fetch("/api/e/finanzas/ficha", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cedula: c }) });
      if (!r.ok) { setMensaje("No se pudo consultar. Revise la conexión: sin conexión no se puede pagar."); return; }
      const d = await r.json();
      if (!d.encontrada) { setFicha(null); setMensaje("No encontramos esa cédula."); return; }
      setFicha(d.ficha); setVerificado(false); setConfirmando(false);
    } catch { setMensaje("No hay conexión. Sin conexión no se puede pagar."); }
  }, []);

  const generar = async () => {
    if (!ficha) return;
    setOcupado(true); setMensaje("");
    const ventana = window.open("", "_blank"); // se abre antes del await para que el navegador no la bloquee
    try {
      const r = await fetch(`/api/e/finanzas/acta/${ficha.mjrvId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ verificado }) });
      if (!r.ok) { ventana?.close(); setMensaje((await r.json()).error ?? "No se pudo generar el acta."); return; }
      const borrador = r.headers.get("x-acta-borrador") === "1";
      const url = URL.createObjectURL(await r.blob());
      if (ventana) ventana.location.href = url; else window.open(url, "_blank");
      if (borrador) setMensaje("Se generó solo un BORRADOR: faltan parámetros de pago. No se puede confirmar el pago.");
      await cargar(ficha.cedula);
      setVerificado(true);
    } catch { ventana?.close(); setMensaje("No hay conexión."); } finally { setOcupado(false); }
  };

  const confirmar = async () => {
    if (!ficha?.acta) return;
    setOcupado(true);
    try {
      const r = await fetch("/api/e/finanzas/confirmar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mjrvId: ficha.mjrvId, actaId: ficha.acta.id, verificado }) });
      const d = await r.json();
      if (!d.ok) setMensaje(d.mensaje ?? "No se pudo confirmar.");
      await cargar(ficha.cedula);
    } catch { setMensaje("No hay conexión. El pago no se ha confirmado."); } finally { setOcupado(false); setConfirmando(false); }
  };

  if (ficha && capturar) {
    return (<div className="space-y-3"><button onClick={() => { setCapturar(false); void cargar(ficha.cedula); }} className="rounded border border-slate-500 px-4 py-3 font-semibold">← Volver a la ficha de pago</button><Documentacion inicial={ficha.cedula} /></div>);
  }
  return (
    <div className="mx-auto max-w-xl space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); void cargar(cedula); }} className="flex gap-2">
        <input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Escribir cédula" autoComplete="off" className="min-w-0 flex-1 rounded border border-slate-400 px-3 py-3 text-lg" />
        <button className="rounded bg-slate-800 px-5 py-3 font-semibold text-white">Buscar</button>
      </form>
      {!ficha && <LectorQr onCodigo={(c) => { setCedula(c); void cargar(c); }} />}
      {mensaje && <p role="alert" className="font-semibold text-red-700">{mensaje}</p>}
      {ficha && (
        <section className="space-y-3 rounded border p-3">
          {ficha.pago && (
            <p role="alert" className="rounded bg-red-700 p-3 text-center text-lg font-extrabold text-white">
              YA PAGADO el {hora(ficha.pago.en)} por {ficha.pago.operador}, {ficha.pago.importeEur} EUR. No vuelva a pagar.{ficha.pago.simulado ? " (Pago simulado)" : ""}
            </p>
          )}
          <div><p className="text-lg font-semibold">{ficha.nombre}</p><p className="text-sm">Cédula {ficha.cedula} · {ficha.cargo} · junta {ficha.juntaVigente}{ficha.juntaVigente !== ficha.juntaOrigen ? ` (origen ${ficha.juntaOrigen})` : ""}</p></div>
          <ul className="space-y-1">
            <Req ok={ficha.activo} texto="Ficha activa" />
            <Req ok={ficha.anverso} texto="Documento: anverso" />
            <Req ok={ficha.reverso} texto="Documento: reverso" />
            <Req ok={!ficha.pago} texto="Sin pago previo" />
            <Req ok={ficha.parametrosCompletos} texto={ficha.parametrosCompletos ? `Parámetros de pago completos · ${ficha.importeEur} EUR` : `Parámetros de pago pendientes (${ficha.faltanParametros.join(", ")})`} />
          </ul>
          {!ficha.documentosCompletos && !ficha.pago && <button onClick={() => setCapturar(true)} className="w-full rounded border-2 border-blue-700 px-4 py-4 text-lg font-bold text-blue-800">Capturar ahora</button>}
          {!ficha.pago && ficha.activo && (
            <>
              <label className="flex items-start gap-3 rounded bg-slate-100 p-3 text-base font-medium">
                <input type="checkbox" checked={verificado} onChange={(e) => setVerificado(e.target.checked)} className="mt-1 h-6 w-6" />
                He verificado que cumplió sus funciones
              </label>
              <button disabled={!verificado || !ficha.documentosCompletos || ocupado} onClick={generar} className="w-full rounded bg-blue-700 px-4 py-4 text-lg font-bold text-white disabled:opacity-50">
                {ficha.acta ? `Reimprimir acta (REIMPRESIÓN ${ficha.acta.impresionN + 1})` : "Generar e imprimir acta"}
              </button>
              {ficha.acta && ficha.parametrosCompletos && (
                <div className="mt-6 border-t-4 border-dashed pt-4">
                  {!confirmando ? (
                    <button disabled={!verificado || ocupado} onClick={() => setConfirmando(true)} className="w-full rounded bg-green-800 px-4 py-5 text-xl font-extrabold text-white disabled:opacity-50">Confirmar pago entregado</button>
                  ) : (
                    <div role="dialog" aria-label="Confirmar pago" className="space-y-3 rounded border-2 border-green-800 p-3">
                      <p className="text-lg">Confirme que el acta está firmada y el dinero entregado: <strong>{ficha.importeEur} EUR</strong> a <strong>{ficha.nombre}</strong>.{ficha.modoPrueba ? " (Pago simulado: modo prueba)" : ""}</p>
                      <div className="flex gap-3">
                        <button disabled={ocupado} onClick={confirmar} className="flex-1 rounded bg-green-800 px-4 py-4 text-lg font-bold text-white">Sí, confirmar</button>
                        <button disabled={ocupado} onClick={() => setConfirmando(false)} className="flex-1 rounded border-2 border-slate-600 px-4 py-4 text-lg font-bold">Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {ficha.pago && <p className="text-center font-semibold text-green-900">Pago confirmado a las {hora(ficha.pago.en)} por {ficha.pago.operador}{ficha.pago.simulado ? " · Pago simulado" : ""}.</p>}
          <button onClick={() => { setFicha(null); setCedula(""); setMensaje(""); }} className="w-full rounded border-2 border-slate-600 px-4 py-3 font-semibold">Otra persona</button>
        </section>
      )}
    </div>
  );
}
