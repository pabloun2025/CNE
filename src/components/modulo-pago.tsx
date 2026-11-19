"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CapturaCedula } from "@/components/captura-cedula";

type Ficha = {
  mjrvId: number; cedula: string; apellidos: string; nombres: string; nombre: string; cargo: string; juntaOrigen: string; juntaVigente: string; activo: boolean;
  anverso: boolean; reverso: boolean; documentosCompletos: boolean; cedulaValidada: boolean; parametrosCompletos: boolean; faltanParametros: string[]; importeUsd: string | null; importeEur: string | null;
  acta: { id: number; impresionN: number } | null; pago: { en: string; operador: string; importeUsd: string; importeEur: string | null; simulado: boolean } | null;
  estado: string; modoPrueba: boolean; otrosPuestos: { etiqueta: string; operador: string; haceMin: number }[];
};
const hora = (t: string) => new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });
const Req = ({ ok, texto }: { ok: boolean; texto: string }) => <li className={ok ? "text-green-800" : "font-semibold text-red-700"}>{ok ? "✔" : "✘"} {texto}</li>;

export function ModuloPago({ cedulaInicial = "" }: { cedulaInicial?: string }) {
  const [cedula, setCedula] = useState(cedulaInicial);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [verificado, setVerificado] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");

  const cargar = useCallback(async (c: string) => {
    setMensaje("");
    try {
      const r = await fetch("/api/admin/finanzas/ficha", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cedula: c }) });
      if (!r.ok) { setMensaje("No se pudo consultar. Revise la conexión: sin conexión no se puede pagar."); return; }
      const d = await r.json();
      if (!d.encontrada) { setFicha(null); setMensaje("No encontramos esa cédula."); return; }
      setFicha(d.ficha); setVerificado(false); setConfirmando(false);
    } catch { setMensaje("No hay conexión. Sin conexión no se puede pagar."); }
  }, []);

  const subir = async (lado: "anverso" | "reverso", imagen: Blob) => {
    if (!ficha) return;
    const f = new FormData();
    f.set("mjrvId", String(ficha.mjrvId));
    f.set("lado", lado);
    f.set("imagen", imagen, `${lado}.jpg`);
    const r = await fetch("/api/admin/finanzas/foto", { method: "POST", body: f });
    if (!r.ok) setMensaje((await r.json()).error ?? "No se pudo guardar la foto.");
    await cargar(ficha.cedula);
  };

  const aceptar = async () => {
    if (!ficha) return;
    setOcupado(true);
    try {
      const r = await fetch("/api/admin/finanzas/validar-cedula", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mjrvId: ficha.mjrvId }) });
      const d = await r.json();
      setAviso(d.ok ? "Cédula aceptada como válida." : d.mensaje ?? "No se pudo aceptar.");
      if (d.ok) await cargar(ficha.cedula);
    } catch { setAviso("No hay conexión."); } finally { setOcupado(false); }
  };

  const generar = async () => {
    if (!ficha) return;
    setOcupado(true); setMensaje("");
    const ventana = window.open("", "_blank");
    try {
      const r = await fetch(`/api/admin/finanzas/acta/${ficha.mjrvId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ verificado }) });
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
      const r = await fetch("/api/admin/finanzas/confirmar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mjrvId: ficha.mjrvId, actaId: ficha.acta.id, verificado }) });
      const d = await r.json();
      if (!d.ok) setMensaje(d.mensaje ?? "No se pudo confirmar.");
      await cargar(ficha.cedula);
    } catch { setMensaje("No hay conexión. El pago no se ha confirmado."); } finally { setOcupado(false); setConfirmando(false); }
  };

  const montos = ficha?.importeEur ? `${ficha.importeEur} EUR` : "";
  const ladoFaltante = ficha && !ficha.anverso ? "anverso" : ficha && !ficha.reverso ? "reverso" : null;
  return (
    <div className="mx-auto max-w-xl space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); void cargar(cedula); }} className="flex gap-2">
        <input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Escribir cédula" aria-label="Cédula" autoComplete="off" className="min-w-0 flex-1 border border-slate-400 px-3 py-3" />
        <button className="bg-stone-900 px-4 text-white">Buscar</button>
      </form>
      {cedulaInicial && !ficha && <CargaInicial cedula={cedulaInicial} cargar={cargar} />}
      {mensaje && <p role="alert" className="font-semibold text-red-700">{mensaje}</p>}
      {ficha && (
        <section className="space-y-3 border-2 border-stone-900 p-3">
          {ficha.otrosPuestos.map((o) => (
            <p key={`${o.etiqueta}-${o.operador}`} role="alert" className="border-2 border-amber-700 bg-amber-50 p-3 font-semibold text-amber-950">
              {o.etiqueta} ({o.operador}) está haciendo este pago {o.haceMin < 1 ? "hace menos de 1 min" : `desde hace ${o.haceMin} min`}. No se puede continuar.
            </p>
          ))}
          {ficha.pago && (
            <p role="alert" className="cifra bg-red-700 p-3 text-center text-lg font-extrabold text-white">
              YA PAGADO el {hora(ficha.pago.en)} por {ficha.pago.operador}, {ficha.pago.importeEur ? `${ficha.pago.importeEur} EUR` : "importe EUR no registrado"}. No vuelva a pagar.{ficha.pago.simulado ? " (Pago simulado)" : ""}
            </p>
          )}
          <div><p className="text-xl font-bold">{ficha.nombre}</p><p>Cédula {ficha.cedula} · {ficha.cargo} · junta {ficha.juntaVigente}{ficha.juntaVigente !== ficha.juntaOrigen ? ` (origen ${ficha.juntaOrigen})` : ""}</p></div>
          {(ficha.anverso || ficha.reverso) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {(["anverso", "reverso"] as const).filter((l) => ficha[l]).map((l) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={l} src={`/api/admin/finanzas/cedula/${ficha.mjrvId}/${l}`} alt={`Vista previa del ${l} de la cédula`} className="max-h-48 w-full rounded border object-contain" />
              ))}
            </div>
          )}
          {!ficha.pago && ladoFaltante && (
            <div className="space-y-2">
              <p className="text-lg font-bold">Faltan las fotos de la cédula. Tome el anverso y el reverso antes de continuar.</p>
              <CapturaCedula rotulo={ladoFaltante === "anverso" ? "Anverso" : "Reverso"} onUsar={(imagen) => subir(ladoFaltante, imagen)} />
            </div>
          )}
          {!ficha.pago && ficha.documentosCompletos && !ficha.cedulaValidada && (
            <button type="button" disabled={ocupado} onClick={() => void aceptar()} className="w-full border-2 border-stone-900 px-4 py-3 font-semibold disabled:opacity-50">Aceptar como válida</button>
          )}
          {aviso && <p role="status" className="font-semibold">{aviso}</p>}
          <ul className="space-y-1">
            <Req ok={ficha.activo} texto="Ficha activa" />
            <Req ok={ficha.cedulaValidada} texto={ficha.cedulaValidada ? "Cédula validada" : "Cédula sin validar"} />
            <Req ok={ficha.anverso} texto="Documento: anverso" />
            <Req ok={ficha.reverso} texto="Documento: reverso" />
            <Req ok={!ficha.pago} texto="Sin pago previo" />
            <Req ok={ficha.parametrosCompletos} texto={ficha.parametrosCompletos ? `Parámetros de pago completos · ${montos}` : `Parámetros de pago pendientes (${ficha.faltanParametros.join(", ")})`} />
          </ul>
          {!ficha.pago && ficha.activo && ficha.otrosPuestos.length === 0 && ficha.documentosCompletos && (
            <>
              <label className="flex items-start gap-3 border-2 border-stone-900 bg-stone-50 p-3 text-base font-semibold">
                <input type="checkbox" checked={verificado} onChange={(e) => setVerificado(e.target.checked)} className="mt-1 h-6 w-6" />
                He verificado que cumplió sus funciones
              </label>
              <button disabled={!verificado || ocupado} onClick={() => void generar()} className="w-full bg-stone-900 px-4 py-4 text-lg text-white disabled:opacity-50">
                {ficha.acta ? `Reimprimir acta (REIMPRESIÓN ${ficha.acta.impresionN + 1})` : "Generar e imprimir acta"}
              </button>
              {ficha.acta && ficha.parametrosCompletos && (
                <div className="mt-6 border-t-4 border-dashed pt-4">
                  {!confirmando ? (
                    <button disabled={!verificado || ocupado} onClick={() => setConfirmando(true)} className="w-full bg-green-800 px-4 py-5 text-xl font-extrabold text-white disabled:opacity-50">Confirmar pago entregado</button>
                  ) : (
                    <div role="dialog" aria-label="Confirmar pago" className="space-y-3 border-2 border-green-800 p-3">
                      <p className="text-lg">Confirme que el acta está firmada y el dinero entregado: <strong className="cifra">{montos}</strong> a <strong>{ficha.nombre}</strong>.{ficha.modoPrueba ? " (Pago simulado: modo prueba)" : ""}</p>
                      <div className="flex gap-3">
                        <button disabled={ocupado} onClick={() => void confirmar()} className="flex-1 bg-green-800 px-4 py-4 text-lg text-white">Sí, confirmar</button>
                        <button disabled={ocupado} onClick={() => setConfirmando(false)} className="flex-1 border-2 border-stone-900 px-4 py-4 text-lg">Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {ficha.pago && <p className="text-center font-semibold text-green-900">Pago confirmado a las {hora(ficha.pago.en)} por {ficha.pago.operador}{ficha.pago.simulado ? " · Pago simulado" : ""}.</p>}
          <button onClick={() => { setFicha(null); setCedula(""); setMensaje(""); setAviso(""); }} className="w-full border-2 border-stone-900 px-4 py-3">Otra persona</button>
        </section>
      )}
    </div>
  );
}

function CargaInicial({ cedula, cargar }: { cedula: string; cargar: (c: string) => Promise<void> }) {
  const hecho = useRef(false);
  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;
    void cargar(cedula);
  }, [cedula, cargar]);
  return null;
}
