"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { FilaLista } from "@/server/mjrv";
import { borrarMjrvSeleccionAccion } from "@/server/mjrv-actions";
import { DistribuirCredenciales, IdsCredenciales } from "./envios-credenciales";

export function ListaMjrvSeleccion({ filas }: { filas: FilaLista[] }) {
  const [seleccion, seleccionar] = useState(() => new Set<number>());
  const [confirmar, confirmarBorrado] = useState(false);
  const [borrado, borrar, borrando] = useActionState(async (_: Awaited<ReturnType<typeof borrarMjrvSeleccionAccion>> | null, datos: FormData) => {
    const r = await borrarMjrvSeleccionAccion(datos);
    if (r.ok) {
      seleccionar(new Set(r.retenidas.map((f) => f.id)));
      confirmarBorrado(false);
    }
    return r;
  }, null);
  const elegidas = filas.filter((m) => seleccion.has(m.id));
  const ids = elegidas.map((m) => m.id);
  const credenciales = elegidas.filter((m) => m.activo && m.rotulo_credencial?.trim()).map((m) => m.id);
  const cantidad = ids.length;
  const todas = filas.length > 0 && cantidad === filas.length;
  const excluidas = cantidad - credenciales.length;

  return (
    <div className="stack">
      {borrado && (borrado.ok ? (
        <div className="card stack" role="status">
          <p>{borrado.borradas} {borrado.borradas === 1 ? "ficha borrada" : "fichas borradas"}{borrado.retenidas.length > 0 && ` · ${borrado.retenidas.length} sin borrar`}.</p>
          {borrado.retenidas.length > 0 && <ul className="list-disc space-y-1 pl-5">
            {borrado.retenidas.map((f) => {
              const m = filas.find((m) => m.id === f.id);
              return <li key={f.id}>{m && <><Link className="underline" href={`/admin/mjrv/${f.id}`}>{m.apellidos}, {m.nombres}</Link>{" · "}</>}{f.mensaje}</li>;
            })}
          </ul>}
        </div>
      ) : <p role="alert" className="text-red-800">{borrado.mensaje}</p>)}
      {filas.length > 0 && <>
        <div className="card stack">
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={todas} disabled={confirmar}
              ref={(input) => { if (input) input.indeterminate = cantidad > 0 && !todas; }}
              onChange={(e) => seleccionar(e.target.checked ? new Set(filas.map((m) => m.id)) : new Set())} />
            Seleccionar todas las coincidencias
          </label>
          <p role="status">{cantidad} de {filas.length} fichas seleccionadas</p>
          {excluidas > 0 && <p className="hint">Credenciales disponibles para {credenciales.length} de las fichas seleccionadas. Revise las fichas de baja o sin rótulo.</p>}
          <DistribuirCredenciales ids={credenciales} bloqueado={borrando || confirmar} />
          <div className="flex flex-wrap gap-3 border-t pt-3">
            <button type="button" className="quiet" disabled={!cantidad || borrando} onClick={() => { seleccionar(new Set()); confirmarBorrado(false); }}>Quitar selección</button>
            <button type="button" className="secondary text-red-800" disabled={!cantidad || confirmar} onClick={() => confirmarBorrado(true)}>Borrar selección</button>
          </div>
          {confirmar && (
            <form action={borrar} className="stack border-t pt-3">
              <IdsCredenciales ids={ids} />
              <p>Se borrarán las fichas seleccionadas y sus datos asociados de forma permanente. Las fichas con pago, recibo definitivo o cargo en una junta constituida quedarán en la lista.</p>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="confirmar" value="1" required disabled={borrando} /> Confirmo el borrado de {cantidad} {cantidad === 1 ? "ficha" : "fichas"}
              </label>
              <div className="flex flex-wrap gap-3">
                <button className="bg-red-800 px-4 py-2 font-semibold" disabled={!cantidad || borrando}>{borrando ? "Borrando…" : "Borrar definitivamente"}</button>
                <button type="button" className="quiet" disabled={borrando} onClick={() => confirmarBorrado(false)}>Cancelar</button>
              </div>
            </form>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th scope="col" className="p-2"><span className="sr-only">Seleccionar</span></th>
                <th scope="col" className="hidden p-2 sm:table-cell">Junta</th>
                <th scope="col" className="p-2">Persona</th>
                <th scope="col" className="hidden p-2 sm:table-cell">Cargo</th>
                <th scope="col" className="hidden p-2 sm:table-cell">Estado</th>
                <th scope="col" className="p-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((m) => {
                const nombre = `${m.apellidos}, ${m.nombres}`;
                const junta = m.vigente === m.origen ? m.origen : `${m.origen} → ${m.vigente}`;
                const estado = !m.activo ? "De baja" : m.ingresado ? "Ingresó" : "Sin ingresar";
                const sinRotulo = m.activo && !m.rotulo_credencial?.trim();
                return (
                  <tr key={m.id} className="border-b">
                    <td className="p-2">
                      <input type="checkbox" aria-label={`Seleccionar a ${nombre}`}
                        checked={seleccion.has(m.id)} disabled={confirmar} onChange={(e) => {
                          const marcada = e.target.checked;
                          seleccionar((anterior) => {
                            const ids = new Set(anterior);
                            if (marcada) ids.add(m.id);
                            else ids.delete(m.id);
                            return ids;
                          });
                        }} />
                    </td>
                    <td className="hidden p-2 font-semibold sm:table-cell">{junta}</td>
                    <td className="p-2">
                      <Link className="underline" href={`/admin/mjrv/${m.id}`}>{nombre}</Link>
                      <div className="text-slate-600">{m.cedula}{m.es_prueba ? " · PRUEBA" : ""}</div>
                      <div className="text-slate-600 sm:hidden">{junta} · {m.rol} · {estado}{sinRotulo && " · Sin rótulo"}</div>
                    </td>
                    <td className="hidden p-2 sm:table-cell">{m.rol}</td>
                    <td className="hidden p-2 sm:table-cell">
                      {estado}{sinRotulo && <span className="block hint">Sin rótulo</span>}
                    </td>
                    <td className="p-2"><Link className="underline" href={`/admin/mjrv/${m.id}`}>Editar</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>}
    </div>
  );
}
