"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { normalizarFrase } from "@/domain/limpieza";
import type { DestinatarioSms } from "@/server/envios/sms-modulo";
import { enviarSmsAccion } from "@/server/sms-actions";

export function PanelSmsCredenciales({ destinatarios, maxSeleccion, bloqueo }: { destinatarios: DestinatarioSms[]; maxSeleccion: number; bloqueo: string | null }) {
  const [estado, enviar, pendiente] = useActionState(enviarSmsAccion, null);
  const [seleccion, cambiarSeleccion] = useState<number[]>([]);
  const [busqueda, cambiarBusqueda] = useState("");
  const [descartada, descartar] = useState("");
  const vista = estado && "confirmacion" in estado && estado.confirmacion !== descartada ? estado : null;
  const disponible = !bloqueo && destinatarios.length > 0;
  const tituloVista = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (vista) tituloVista.current?.focus(); }, [vista]);

  const consulta = normalizarFrase(busqueda);
  const coincidencias = destinatarios.filter(({ nombre, junta }) => normalizarFrase(`${nombre} ${junta}`).includes(consulta));
  const ids = seleccion.filter((id) => destinatarios.some((ficha) => ficha.id === id));

  return (
    <section className="max-w-2xl card stack" aria-labelledby="sms-seleccion">
      <h2 id="sms-seleccion" ref={tituloVista} tabIndex={-1}>{vista ? "Revise los SMS" : disponible ? "Seleccione las fichas" : "Disponibilidad"}</h2>
      {estado && "error" in estado && <p className="text-red-800" role="alert">{estado.error}</p>}
      {estado && "aviso" in estado && <p role="status">{estado.aviso}</p>}
      {vista ? (
        <form action={enviar} className="stack" key={vista.confirmacion}>
          <input type="hidden" name="intencion" value="enviar" />
          <input type="hidden" name="revision" value={vista.confirmacion} />
          <p>{vista.destinatarios.length} {vista.destinatarios.length === 1 ? "destinatario seleccionado" : "destinatarios seleccionados"}. SMS Publi añadirá el enlace corto de cada credencial.</p>
          <ul className="stack">
            {vista.destinatarios.map((ficha) => (
              <li key={ficha.id} className="stack rounded-md border border-slate-200 p-3">
                <input type="hidden" name="ids" value={ficha.id} />
                <h3 className="wrap-break-word">{ficha.nombre} · {ficha.junta}</h3>
                <p className="text-sm">Destino {ficha.movil} · Remitente {ficha.remitente}</p>
                <p className="whitespace-pre-wrap rounded-md bg-slate-50 p-3">{ficha.texto}</p>
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="confirmar" value="1" required disabled={pendiente} />
            <span>He revisado los destinatarios y autorizo el envío real de estos SMS.</span>
          </label>
          <div className="flex flex-wrap gap-3">
            <button className="button-like disabled:opacity-60" type="submit" disabled={pendiente}>{pendiente ? "Tramitando los SMS…" : "Confirmar y enviar SMS"}</button>
            <button type="button" className="button-like secondary" disabled={pendiente} onClick={() => descartar(vista.confirmacion)}>Volver a la selección</button>
          </div>
        </form>
      ) : disponible ? (
        <form action={enviar} className="stack" key="seleccion">
          <input type="hidden" name="intencion" value="revisar" />
          {ids.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
          <p>Puede revisar hasta {maxSeleccion} fichas por envío. La lista incluye fichas pendientes con un móvil válido y de uso individual.</p>
          <label>Buscar por nombre o junta
            <input className="w-full" type="search" value={busqueda} onChange={(e) => cambiarBusqueda(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} />
          </label>
          <p role="status">{ids.length} de {maxSeleccion} fichas seleccionadas</p>
          {coincidencias.length ? (
            <ul className="max-h-80 overflow-y-auto divide-y divide-slate-200">
              {coincidencias.map(({ id, nombre, junta, movil }) => (
                <li key={id} className="py-2">
                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="shrink-0" checked={ids.includes(id)} disabled={pendiente || (ids.length >= maxSeleccion && !ids.includes(id))}
                      onChange={(e) => cambiarSeleccion(e.target.checked ? [...ids, id] : ids.filter((elegida) => elegida !== id))} />
                    <span className="min-w-0 wrap-break-word">{nombre} <small className="block">{junta} · {movil}</small></span>
                  </label>
                </li>
              ))}
            </ul>
          ) : <p>Ninguna ficha coincide con la búsqueda.</p>}
          <div className="flex flex-wrap gap-3">
            <button className="button-like disabled:opacity-60" type="submit" disabled={pendiente || !ids.length}>{pendiente ? "Preparando la vista previa…" : "Revisar los SMS"}</button>
            {!!ids.length && <button className="quiet" type="button" disabled={pendiente} onClick={() => cambiarSeleccion([])}>Quitar selección</button>}
          </div>
        </form>
      ) : <p>{bloqueo ?? "No quedan fichas elegibles para enviar por SMS."}</p>}
    </section>
  );
}
