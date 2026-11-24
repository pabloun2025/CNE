"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CapturaDocumentosPuesto } from "@/components/captura-cedula";
import { leerPdfRecibo, VisorRecibo, type PdfRecibo } from "@/components/visor-recibo";
import type { LadoDocumento } from "@/domain/documentos";
import type { FichaPago } from "@/server/finanzas";

const moneda = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });


type Recibo = PdfRecibo & { mjrvId: number; modoPrueba: boolean };

export function ModuloPago({ cedulaInicial = "", caja = false }: { cedulaInicial?: string; caja?: boolean }) {
  const [cedula, setCedula] = useState(cedulaInicial);
  const [ficha, setFicha] = useState<FichaPago | null>(null);
  const [verificado, verificar] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mostrarCaptura, setMostrarCaptura] = useState(false);
  const [revisionFotos, setRevisionFotos] = useState(0);
  const [recibo, setRecibo] = useState<Recibo | null>(null);
  const urlRecibo = recibo?.url;
  useEffect(() => () => { if (urlRecibo) URL.revokeObjectURL(urlRecibo); }, [urlRecibo]);

  const consultar = async (c: string, conservarRecibo = false) => {
    const r = await fetch("/api/admin/finanzas/ficha", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ cedula: c, vista: caja ? "caja" : "revision" }) });
    if (!r.ok) throw new Error("No se pudo consultar la ficha.");
    const respuesta = await r.json() as { encontrada: boolean; ficha?: FichaPago };
    const nuevaFicha = respuesta.ficha ?? null;
    setFicha(nuevaFicha);
    setMostrarCaptura(false);
    setRecibo((actual) => conservarRecibo && actual && actual.mjrvId === nuevaFicha?.mjrvId && actual.modoPrueba === nuevaFicha.modoPrueba ? actual : null);
    verificar(false);
    if (!respuesta.encontrada) throw new Error("No encontramos ese número.");
  };

  const ejecutar = async (accion: () => Promise<void>) => {
    setMensaje("");
    setOcupado(true);
    try { await accion(); }
    catch (e) { setMensaje(e instanceof Error ? e.message : "No se pudo completar la acción."); }
    finally { setOcupado(false); }
  };

  const subir = async (lado: LadoDocumento, imagen: Blob) => {
    if (!ficha) return false;
    setMensaje("");
    setOcupado(true);
    try {
      const f = new FormData();
      f.set("mjrvId", String(ficha.mjrvId));
      f.set("lado", lado);
      f.set("modo", ficha.modoPrueba ? "prueba" : "eleccion");
      f.set("imagen", imagen, `${lado}.jpg`);
      const r = await fetch("/api/admin/finanzas/foto", { method: "POST", body: f });
      if (!r.ok) throw new Error((await r.json()).error ?? "No se pudo guardar la foto.");
      await consultar(ficha.cedula);
      setRevisionFotos((actual) => actual + 1);
      return true;
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "No se pudo guardar la foto.");
      return false;
    } finally { setOcupado(false); }
  };

  const validar = () => ficha && ejecutar(async () => {
    const r = await fetch("/api/admin/finanzas/validar-cedula", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mjrvId: ficha.mjrvId, modo: ficha.modoPrueba ? "prueba" : "eleccion" }) });
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.mensaje ?? "No se pudo validar.");
    await consultar(ficha.cedula);
  });

  const emitir = (sinAnexo = false) => ficha && ejecutar(async () => {
    const modo = ficha.modoPrueba ? "prueba" : "eleccion";
    const r = sinAnexo
      ? await fetch("/api/admin/finanzas/recibos/emitir", {
        method: "POST", body: new URLSearchParams({ id: String(ficha.mjrvId), modo, formato: "sin_anexo" }),
      })
      : await fetch(`/api/admin/finanzas/acta/${ficha.mjrvId}`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ verificado, modo }) });
    const pdf = await leerPdfRecibo(r);
    setRecibo({ ...pdf, mjrvId: ficha.mjrvId, modoPrueba: ficha.modoPrueba });
    await consultar(ficha.cedula, true);
    setMensaje(r.headers.get("x-acta-borrador") === "1" ? "Se abrió un borrador. Superadministración debe configurar al firmante."
      : sinAnexo && !ficha.cedulaValidada ? "Recibo listo para imprimir. Valide el documento antes de pasar a Caja."
      : "Recibo listo para imprimir. Entréguelo a Caja.");
  });

  const confirmar = () => ficha?.acta && ejecutar(async () => {
    const r = await fetch("/api/admin/finanzas/confirmar", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mjrvId: ficha.mjrvId, actaId: ficha.acta?.id, verificado }) });
    const d = await r.json();
    await consultar(ficha.cedula);
    if (!r.ok || !d.ok) throw new Error(d.mensaje ?? "No se pudo confirmar el pago.");
    setMensaje("Pago confirmado.");
  });

  const listaCaja = !!ficha?.acta && !ficha.acta.importePendiente && !ficha.acta.documentoPendiente && ficha.cedulaValidada && ficha.documentosCompletos;
  return (
    <section className="card stack">
      <h2>{caja ? "Confirmar pago" : "Revisar ficha"}</h2>
      <form onSubmit={(e) => { e.preventDefault(); void ejecutar(() => consultar(cedula)); }} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">Número de cédula<input value={cedula} onChange={(e) => setCedula(e.target.value)} autoComplete="off" required /></label>
        <button className="button-like" disabled={ocupado}>Buscar</button>
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
                <button className="button-like w-full sm:w-auto" disabled={!verificado || ocupado} onClick={confirmar}>Confirmar pago entregado</button>
              </>
            ) : <p role="status">{ficha.acta?.documentoPendiente ? "Reimprima el recibo con el documento vigente antes de confirmar el pago." : "El recibo definitivo y el documento validado deben estar listos antes del pago."}</p>
          ) : (
            <>
              {ficha.otrosPuestos.length > 0 && <p role="status">Esta ficha está abierta en otro puesto.</p>}
              {ficha.acta?.documentoPendiente && <p role="status">Reimprima el recibo con el documento vigente antes de entregarlo a Caja.</p>}
              {(ficha.anverso || ficha.reverso || ficha.pasaporte) && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["anverso", "reverso", "pasaporte"] as const).filter((l) => ficha[l]).map((l) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={l} src={`/api/admin/finanzas/cedula/${ficha.mjrvId}/${l}?v=${revisionFotos}`} alt={l === "pasaporte" ? "Página de datos del pasaporte" : `Cédula · ${l}`} className="max-h-48 w-full rounded border object-contain" />
                  ))}
                </div>
              )}
              {ficha.documentosCompletos && <button type="button" className="button-like secondary" disabled={ocupado} onClick={() => setMostrarCaptura(!mostrarCaptura)}>{mostrarCaptura ? "Cerrar captura" : "Volver a fotografiar el documento"}</button>}
              {(!ficha.documentosCompletos || mostrarCaptura) && (
                <fieldset key={ficha.mjrvId} disabled={ocupado}>
                  <CapturaDocumentosPuesto fotos={ficha} onUsar={subir} seguirConReverso />
                </fieldset>
              )}
              {ficha.documentosCompletos && !ficha.cedulaValidada && <button className="button-like" disabled={ocupado} onClick={validar}>Validar documento</button>}
              {!recibo && <button type="button" className="button-like secondary" disabled={ocupado} onClick={() => emitir(true)}>Imprimir recibo sin anexo</button>}
              {!recibo && ficha.cedulaValidada && ficha.documentosCompletos && (
                <>
                  <label className="flex items-start gap-2"><input type="checkbox" checked={verificado} onChange={(e) => verificar(e.target.checked)} />
                    Verifiqué que cumplió sus funciones como MJRV.
                  </label>
                  <button className="button-like w-full sm:w-auto" disabled={!verificado || ocupado} onClick={() => emitir()}>{ficha.acta ? "Reimprimir recibo" : "Emitir e imprimir recibo"}</button>
                </>
              )}
              {!ficha.parametrosCompletos && <p role="status">Superadministración debe completar los datos del firmante.</p>}
            </>
          ))}
          {ficha.pago && <Link href={{ pathname: "/admin/finanzas/recibos", query: { q: ficha.cedula } }}>Consultar el recibo</Link>}
          {!caja && recibo && <VisorRecibo key={recibo.url} archivo={recibo.archivo} url={recibo.url} nombre={recibo.nombre} />}
          <button className="button-like secondary" disabled={ocupado} onClick={() => { setFicha(null); setRecibo(null); setCedula(""); setMensaje(""); verificar(false); }}>Otra persona</button>
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
