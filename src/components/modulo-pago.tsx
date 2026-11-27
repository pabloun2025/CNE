"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { leerPdfRecibo, VisorRecibo, type PdfRecibo } from "@/components/visor-recibo";
import { formatoPublicoJunta } from "@/domain/juntas";
import type { FichaPago } from "@/server/finanzas";

const moneda = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

type Ficha = Omit<FichaPago, "acta"> & {
  acta: (NonNullable<FichaPago["acta"]> & { impreso?: boolean }) | null;
};
type Recibo = PdfRecibo & { mjrvId: number; modoPrueba: boolean; actaId: number | null; version: string | null };

export function ModuloPago({ cedulaInicial = "", caja = false }: { cedulaInicial?: string; caja?: boolean }) {
  const [cedula, setCedula] = useState(cedulaInicial);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [verificado, verificar] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [recibo, setRecibo] = useState<Recibo | null>(null);
  const urlRecibo = recibo?.url;
  useEffect(() => () => { if (urlRecibo) URL.revokeObjectURL(urlRecibo); }, [urlRecibo]);

  const consultar = async (c: string, conservarRecibo = false) => {
    const r = await fetch("/api/admin/finanzas/ficha", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ cedula: c, vista: caja ? "caja" : "impresion" }) });
    if (!r.ok) throw new Error("No se pudo consultar la ficha.");
    const respuesta = await r.json() as { encontrada: boolean; ficha?: Ficha };
    const nuevaFicha = respuesta.ficha ?? null;
    setFicha(nuevaFicha);
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

  const emitir = () => ficha && ejecutar(async () => {
    const modo = ficha.modoPrueba ? "prueba" : "eleccion";
    const r = await fetch(`/api/admin/finanzas/acta/${ficha.mjrvId}`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ verificado: ficha.actuacionVerificada || verificado, modo }) });
    const borrador = r.headers.get("x-acta-borrador") === "1";
    const actaId = Number(r.headers.get("x-acta-id"));
    const version = r.headers.get("x-acta-version");
    if (r.ok && !borrador && (!Number.isSafeInteger(actaId) || actaId <= 0 || !version)) {
      throw new Error("No se pudo preparar el recibo definitivo. Vuelva a intentarlo.");
    }
    const pdf = await leerPdfRecibo(r);
    setRecibo({ ...pdf, mjrvId: ficha.mjrvId, modoPrueba: ficha.modoPrueba, actaId: borrador ? null : actaId, version });
    await consultar(ficha.cedula, true);
    setMensaje(borrador ? "Se abrió un borrador. Superadministración debe configurar al firmante."
      : "Imprima el recibo. Cuando tenga el papel, envíe la ficha a Caja.");
  });

  const papelListo = () => ficha && recibo?.actaId && recibo.version && ejecutar(async () => {
    const r = await fetch("/api/admin/finanzas/impreso", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mjrvId: ficha.mjrvId, actaId: recibo.actaId, modo: ficha.modoPrueba ? "prueba" : "eleccion",
        version: recibo.version }) });
    const d = await r.json().catch(() => null) as { ok?: boolean; mensaje?: string } | null;
    if (!r.ok || !d?.ok) throw new Error(d?.mensaje ?? "No se pudo enviar la ficha a Caja.");
    if (ficha.acta) setFicha({ ...ficha, acta: { ...ficha.acta, impreso: true } });
    setMensaje("Ficha enviada a Caja. Entregue el recibo en papel.");
  });

  const confirmar = () => ficha?.acta && ejecutar(async () => {
    const r = await fetch("/api/admin/finanzas/confirmar", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mjrvId: ficha.mjrvId, actaId: ficha.acta?.id, modo: ficha.modoPrueba ? "prueba" : "eleccion", verificado: true }) });
    const d = await r.json();
    await consultar(ficha.cedula);
    if (!r.ok || !d.ok) throw new Error(d.mensaje ?? "No se pudo confirmar el pago.");
    setMensaje("Pago confirmado.");
  });

  const documentoValidado = !!ficha?.cedulaValidada && ficha.documentosCompletos;
  const reciboVigente = !!ficha?.acta && !ficha.actuacionRetirada && !ficha.acta.importePendiente && !ficha.acta.documentoPendiente && documentoValidado;
  const enviadoCaja = reciboVigente && ficha?.acta?.impreso;
  const puedeEnviar = reciboVigente && !!recibo?.version && recibo.actaId === ficha?.acta?.id && !enviadoCaja;
  const importe = ficha?.importeEur ? moneda.format(Number(ficha.importeEur)) : null;

  return (
    <section className="card stack">
      <h2>{caja ? "Confirmar pago" : "Preparar recibo"}</h2>
      <form onSubmit={(e) => { e.preventDefault(); void ejecutar(() => consultar(cedula)); }} className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1">Número de cédula<input value={cedula} onChange={(e) => setCedula(e.target.value)} autoComplete="off" required /></label>
        <button className="button-like" disabled={ocupado}>Buscar</button>
      </form>
      {cedulaInicial && <CargaInicial cedula={cedulaInicial} cargar={(c) => ejecutar(() => consultar(c))} />}
      {mensaje && <p role="status" className="font-semibold">{mensaje}</p>}
      {ficha && (
        <div className="stack">
          <div><h3>{ficha.nombre}</h3><p>{ficha.cedula} · Junta {formatoPublicoJunta(ficha.juntaVigente)} · {ficha.cargo}</p></div>
          {ficha.modoPrueba && <p role="status">Modo prueba</p>}
          {ficha.acta && <p>Recibo <strong>{ficha.acta.numero}</strong>{importe ? ` · ${importe}` : ""}</p>}
          {!ficha.activo && <p role="alert">Ficha de baja.</p>}
          {ficha.pago && <p role="alert" className="banner bad">Pago ya confirmado por {ficha.pago.operador}.</p>}
          {!ficha.pago && ficha.activo && ficha.actuacionRetirada && <p role="alert">La actuación fue sustituida. Compruebe con el puesto de mesa quién ejerció el cargo.</p>}
          {!ficha.pago && ficha.activo && !ficha.actuacionRetirada && (caja ? (
            enviadoCaja ? (
              <>
                <p id="confirmacion-caja">
                  {ficha.actuacionVerificada
                    ? "Confirme después de cotejar la junta y el cargo, recoger la firma y entregar el efectivo."
                    : "Confirme después de verificar quién ejerció el cargo, recoger la firma y entregar el efectivo."}
                </p>
                <button type="button" className="button-like w-full sm:w-auto" aria-describedby="confirmacion-caja"
                  disabled={ocupado} onClick={confirmar}>{importe ? `Confirmar entrega de ${importe}` : "Confirmar entrega del pago"}</button>
              </>
            ) : <p role="status">Espere a que Impresión envíe el recibo vigente a Caja.</p>
          ) : (
            <>
              {ficha.otrosPuestos.length > 0 && <p role="status">Esta ficha está abierta en otro puesto.</p>}
              {!documentoValidado ? (
                <p role="status">La ficha necesita pasar por <Link href={{ pathname: "/admin/finanzas/documentos", query: { cedula: ficha.cedula } }}>Revisión</Link> antes de imprimir.</p>
              ) : (
                <>
                  {enviadoCaja && <p role="status">El recibo ya fue remitido a Caja.</p>}
                  {!recibo && (
                    <>
                      {!ficha.actuacionVerificada && (
                        <label className="flex items-start gap-2"><input type="checkbox" checked={verificado} onChange={(e) => verificar(e.target.checked)} />
                          Verifiqué que cumplió sus funciones como MJRV.
                        </label>
                      )}
                      <button type="button" className="button-like w-full sm:w-auto" disabled={(!ficha.actuacionVerificada && !verificado) || ocupado} onClick={emitir}>{ficha.acta ? "Reimprimir recibo" : "Emitir e imprimir recibo"}</button>
                    </>
                  )}
                  {!ficha.parametrosCompletos && <p role="status">Superadministración debe completar los datos del firmante.</p>}
                </>
              )}
            </>
          ))}
          {ficha.pago && <Link href={{ pathname: "/admin/finanzas/recibos", query: { q: ficha.cedula } }}>Consultar el recibo</Link>}
          {!caja && recibo && <VisorRecibo key={recibo.url} archivo={recibo.archivo} url={recibo.url} nombre={recibo.nombre} />}
          {!caja && puedeEnviar && <button type="button" className="button-like" disabled={ocupado} onClick={papelListo}>Papel listo · Enviar a Caja</button>}
          <button className="button-like secondary" disabled={ocupado} onClick={() => { setFicha(null); setRecibo(null); setCedula(""); setMensaje(""); verificar(false); }}>Otra persona</button>
        </div>
      )}
    </section>
  );
}

function CargaInicial({ cedula, cargar }: { cedula: string; cargar: (c: string) => Promise<void> }) {
  const ultima = useRef("");
  useEffect(() => {
    if (ultima.current === cedula) return;
    ultima.current = cedula;
    void cargar(cedula);
  }, [cedula, cargar]);
  return null;
}
