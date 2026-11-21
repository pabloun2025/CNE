"use client";

import { useEffect, useRef, useState } from "react";
import { leerPdfRecibo, VisorRecibo, type PdfRecibo } from "@/components/visor-recibo";
import type { Modo } from "@/server/config";
import type { ReciboFila } from "@/server/recibos";

const fecha = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" });

export function RecibosEmitidos({ filas, total, modo, q, pagina }: { filas: ReciboFila[]; total: number; modo: Modo; q: string; pagina: number }) {
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [todas, setTodas] = useState(false);
  const cantidad = todas ? total : elegidas.length;

  return (
    <form method="post" action="/api/admin/finanzas/recibos/descargar" target="_blank" className="stack">
      <input type="hidden" name="modo" value={modo} />
      {todas ? (
        <>
          <input type="hidden" name="alcance" value="todos" />
          <input type="hidden" name="q" value={q} />
          <input type="hidden" name="total" value={total} />
        </>
      ) : elegidas.map((id) => <input key={id} type="hidden" name="recibo" value={id} />)}
      <div className="card stack">
        <label className="flex items-center gap-3"><input type="checkbox" name="anexo" value="1" /> Incluir las fotos disponibles de la cédula en los recibos nuevos</label>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={todas} onChange={(e) => {
            setTodas(e.target.checked);
            setElegidas([]);
          }} />
          Seleccionar {total === 1 ? "el recibo encontrado" : `los ${total} recibos encontrados`}
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={cantidad === 0}>Descargar {cantidad > 1 ? "ZIP" : "PDF"}</button>
          {cantidad > 0 && <button type="button" className="secondary" onClick={() => {
            setTodas(false);
            setElegidas([]);
          }}>Quitar selección</button>}
          <p role="status">{cantidad} de {total} {cantidad === 1 ? "seleccionado" : "seleccionados"}</p>
        </div>
      </div>
      <FilasRecibos key={pagina} filas={filas} elegidas={elegidas} todas={todas} seleccionar={(id, marcada) => {
        setElegidas((ids) => marcada ? [...ids, id] : ids.filter((elegida) => elegida !== id));
      }} />
    </form>
  );
}

function FilasRecibos({ filas, elegidas, todas, seleccionar }: {
  filas: ReciboFila[];
  elegidas: string[];
  todas: boolean;
  seleccionar: (id: string, marcada: boolean) => void;
}) {
  const [recibo, setRecibo] = useState<(PdfRecibo & { id: string }) | null>(null);
  const [cargando, setCargando] = useState("");
  const [error, setError] = useState<{ id: string; mensaje: string } | null>(null);
  const peticion = useRef<AbortController>(null);
  const urlRecibo = recibo?.url;
  useEffect(() => () => { if (urlRecibo) URL.revokeObjectURL(urlRecibo); }, [urlRecibo]);
  useEffect(() => () => { peticion.current?.abort(); }, []);

  const reimprimir = async (fila: ReciboFila, id: string) => {
    const controlador = new AbortController();
    peticion.current = controlador;
    const { signal } = controlador;
    setCargando(id);
    setError(null);
    try {
      const respuesta = await fetch(`/api/admin/finanzas/recibos/${fila.tipo}/${fila.id}?vista=1&anexo=1`, { signal });
      const pdf = await leerPdfRecibo(respuesta);
      if (signal.aborted) URL.revokeObjectURL(pdf.url);
      else setRecibo({ ...pdf, id });
    } catch (e) {
      if (!signal.aborted) setError({ id, mensaje: e instanceof Error ? e.message : "No se pudo cargar el recibo." });
    } finally {
      if (!signal.aborted) {
        peticion.current = null;
        setCargando("");
      }
    }
  };

  return (
    <ul className="stack">
      {filas.map((r) => {
        const id = `${r.tipo}-${r.id}`;
        return (
          <li key={id} className="card stack">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex min-w-0 items-start gap-3">
                <input type="checkbox" className="shrink-0" aria-label={`Seleccionar recibo ${r.numero} de ${r.nombre}`} checked={todas || elegidas.includes(id)} disabled={todas}
                  onChange={(e) => seleccionar(id, e.target.checked)} />
                <span>
                  <span className="block font-semibold">{r.nombre}</span>
                  <span className="block text-sm">{r.cedula} · {r.numero} · {fecha.format(r.emitido)}</span>
                  <span className="hint block">
                    {r.pagado === null ? "Sin vínculo al pago" : r.pagado ? "Pago confirmado" : "Sin pago asociado"}
                    {r.importe && ` · ${r.importe} EUR`}
                    {r.importeUsd && ` · ${r.importeUsd} USD de referencia`}
                    {r.historico && r.tipo === "acta" && " · Emisión histórica"}
                    {r.reconstruido ? " · Copia reconstruida" : r.tipo === "firma" ? " · Firma digital archivada" : ""}
                  </span>
                </span>
              </label>
              {recibo?.id !== id && (
                <button type="button" className="secondary" aria-label={`Reimprimir recibo ${r.numero}`} disabled={!!cargando}
                  onClick={() => void reimprimir(r, id)}>{cargando === id ? "Cargando PDF…" : "Reimprimir"}</button>
              )}
            </div>
            {error?.id === id && <p role="status">{error.mensaje}</p>}
            {recibo?.id === id && <VisorRecibo key={recibo.url} archivo={recibo.archivo} url={recibo.url} nombre={recibo.nombre} />}
          </li>
        );
      })}
    </ul>
  );
}
