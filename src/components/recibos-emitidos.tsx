"use client";

import { useState } from "react";
import type { Modo } from "@/server/config";
import type { ReciboFila } from "@/server/recibos";

const fecha = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" });

export function RecibosEmitidos({ filas, total, modo, q }: { filas: ReciboFila[]; total: number; modo: Modo; q: string }) {
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
      <ul className="stack">
        {filas.map((r) => {
          const id = `${r.tipo}-${r.id}`;
          return (
            <li key={id} className="card flex flex-wrap items-center justify-between gap-3">
              <label className="flex min-w-0 items-start gap-3">
                <input type="checkbox" className="shrink-0" aria-label={`Seleccionar recibo ${r.numero} de ${r.nombre}`} checked={todas || elegidas.includes(id)} disabled={todas}
                  onChange={(e) => {
                    const marcada = e.target.checked;
                    setElegidas((ids) => marcada ? [...ids, id] : ids.filter((elegida) => elegida !== id));
                  }} />
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
              <a className="button-like secondary" target="_blank" rel="noopener" aria-label={`Reimprimir recibo ${r.numero}`}
                href={`/api/admin/finanzas/recibos/${r.tipo}/${r.id}?vista=1`}>Reimprimir</a>
            </li>
          );
        })}
      </ul>
    </form>
  );
}
