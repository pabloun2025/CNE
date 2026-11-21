"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CapturaCedula } from "@/components/captura-cedula";
import type { FichaPago } from "@/server/finanzas";

const moneda = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export function ModuloPago({ cedulaInicial = "", caja = false }: { cedulaInicial?: string; caja?: boolean }) {
  const [cedula, setCedula] = useState(cedulaInicial);
  const [ficha, setFicha] = useState<FichaPago | null>(null);
  const [verificado, verificar] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const consultar = async (c: string) => {
    const r = await fetch("/api/admin/finanzas/ficha", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ cedula: c, vista: caja ? "caja" : "revision" }) });
    if (!r.ok) throw new Error("No se pudo consultar la ficha.");
    const respuesta = await r.json() as { encontrada: boolean; ficha?: FichaPago };
    setFicha(respuesta.ficha ?? null);
    verificar(false);
    if (!respuesta.encontrada) throw new Error("No encontramos esa cédula.");
  };

  const ejecutar = async (accion: () => Promise<void>) => {
    setMensaje("");
    setOcupado(true);
    try { await accion(); }
    catch (e) { setMensaje(e instanceof Error ? e.message : "No se pudo completar la acción."); }
    finally { setOcupado(false); }
  };

  const subir = async (lado: "anverso" | "reverso", imagen: Blob) => {
    if (!ficha) return false;
    try {
      const f = new FormData();
      f.set("mjrvId", String(ficha.mjrvId));
      f.set("lado", lado);
      f.set("imagen", imagen, `${lado}.jpg`);
      const r = await fetch("/api/admin/finanzas/foto", { method: "POST", body: f });
      if (!r.ok) throw new Error((await r.json()).error ?? "No se pudo guardar la foto.");
      await consultar(ficha.cedula);
      setMensaje("");
      return true;
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "No se pudo guardar la foto.");
      return false;
    }
  };

  const validar = () => ficha && ejecutar(async () => {
    const r = await fetch("/api/admin/finanzas/validar-cedula", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mjrvId: ficha.mjrvId, modo: ficha.modoPrueba ? "prueba" : "eleccion" }) });
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.mensaje ?? "No se pudo validar.");
    await consultar(ficha.cedula);
  });

  const imprimir = () => {
    if (!ficha) return;
    const ventana = window.open("", "_blank");
    if (!ventana) { setMensaje("Permita las ventanas emergentes para abrir el recibo e imprimirlo."); return; }
    void ejecutar(async () => {
      try {
        const r = await fetch(`/api/admin/finanzas/acta/${ficha.mjrvId}`, { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ verificado, modo: ficha.modoPrueba ? "prueba" : "eleccion" }) });
        if (!r.ok) throw new Error((await r.json()).error ?? "No se pudo emitir el recibo.");
        const url = URL.createObjectURL(await r.blob());
        ventana.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
        await consultar(ficha.cedula);
        setMensaje(r.headers.get("x-acta-borrador") === "1" ? "Se abrió un borrador. Superadministración debe configurar al firmante." : "Recibo listo para imprimir. Entréguelo a Caja.");
      } catch (e) {
        if (ventana.location.href === "about:blank") ventana.close();
        throw e;
      }
    });
  };

  const confirmar = () => ficha?.acta && ejecutar(async () => {
    const r = await fetch("/api/admin/finanzas/confirmar", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mjrvId: ficha.mjrvId, actaId: ficha.acta?.id, verificado }) });
    const d = await r.json();
    await consultar(ficha.cedula);
    if (!r.ok || !d.ok) throw new Error(d.mensaje ?? "No se pudo confirmar el pago.");
    setMensaje("Pago confirmado.");
  });

  const lado = ficha && !ficha.anverso ? "anverso" : ficha && !ficha.reverso ? "reverso" : null;
  const listaCaja = !!ficha?.acta && !ficha.acta.importePendiente && ficha.cedulaValidada && ficha.documentosCompletos;
  return (
    <section className="card stack">
      <h2>{caja ? "Confirmar pago" : "Revisar ficha"}</h2>
      <form onSubmit={(e) => { e.preventDefault(); void ejecutar(() => consultar(cedula)); }} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">Cédula<input value={cedula} onChange={(e) => setCedula(e.target.value)} inputMode="numeric" autoComplete="off" required /></label>
        <button disabled={ocupado}>Buscar</button>
      </form>
      {cedulaInicial && <CargaInicial cedula={cedulaInicial} cargar={(c) => ejecutar(() => consultar(c))} />}
      {mensaje && <p role="status" className="font-semibold">{mensaje}</p>}
      {ficha && (
        <div className="stack">
          <div><h3>{ficha.nombre}</h3><p>{ficha.cedula} · Junta {ficha.juntaVigente} · {ficha.cargo}</p></div>
          {ficha.modoPrueba && <p role="status">Modo prueba</p>}
          {ficha.acta && <p>Recibo <strong>{ficha.acta.numero}</strong>{ficha.importeEur ? ` · ${moneda.format(Number(ficha.importeEur))}` : ""}</p>}
          {!ficha.activo && <p role="alert">Ficha de baja.</p>}
          {ficha.pago && <p role="alert" className="banner bad">Pago ya confirmado por {ficha.pago.operador}.</p>}
          {!ficha.pago && ficha.activo && (caja ? (
            listaCaja ? (
              <>
                <label className="flex items-start gap-2"><input type="checkbox" checked={verificado} onChange={(e) => verificar(e.target.checked)} />
                  Verifiqué que el recibo está firmado en papel y que el efectivo fue entregado.
                </label>
                <button disabled={!verificado || ocupado} onClick={confirmar}>Confirmar pago entregado</button>
              </>
            ) : <p role="status">El recibo definitivo y la cédula validada deben estar listos antes del pago.</p>
          ) : (
            <>
              {ficha.otrosPuestos.length > 0 && <p role="status">Esta ficha está abierta en otro puesto.</p>}
              {(ficha.anverso || ficha.reverso) && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["anverso", "reverso"] as const).filter((l) => ficha[l]).map((l) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={l} src={`/api/admin/finanzas/cedula/${ficha.mjrvId}/${l}`} alt={`Cédula · ${l}`} className="max-h-48 w-full rounded border object-contain" />
                  ))}
                </div>
              )}
              {lado && <CapturaCedula rotulo={lado === "anverso" ? "Anverso" : "Reverso"} onUsar={(imagen) => subir(lado, imagen)} />}
              {ficha.documentosCompletos && !ficha.cedulaValidada && <button disabled={ocupado} onClick={validar}>Validar cédula</button>}
              {!ficha.cedulaValidada && <form method="post" action="/api/admin/finanzas/recibos/emitir" target="_blank">
                <input type="hidden" name="id" value={ficha.mjrvId} />
                <input type="hidden" name="modo" value={ficha.modoPrueba ? "prueba" : "eleccion"} />
                <button className="secondary">Imprimir en contingencia</button>
              </form>}
              {ficha.cedulaValidada && ficha.documentosCompletos && (
                <>
                  <label className="flex items-start gap-2"><input type="checkbox" checked={verificado} onChange={(e) => verificar(e.target.checked)} />
                    Verifiqué que cumplió sus funciones como MJRV.
                  </label>
                  <button disabled={!verificado || ocupado} onClick={imprimir}>{ficha.acta ? "Reimprimir recibo" : "Emitir e imprimir recibo"}</button>
                </>
              )}
              {!ficha.parametrosCompletos && <p role="status">Superadministración debe completar los datos del firmante.</p>}
            </>
          ))}
          {ficha.pago && <Link href={{ pathname: "/admin/finanzas/recibos", query: { q: ficha.cedula } }}>Consultar el recibo</Link>}
          <button className="secondary" onClick={() => { setFicha(null); setCedula(""); setMensaje(""); verificar(false); }}>Otra persona</button>
        </div>
      )}
    </section>
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
