"use client";

import Link from "next/link";
import { useState } from "react";
import type { FilaLista } from "@/server/mjrv";

export function ListaMjrvSeleccion({ filas }: { filas: FilaLista[] }) {
  const [seleccion, seleccionar] = useState(() => new Set<number>());
  const elegibles = new Set(filas.filter((m) => m.activo && m.rotulo_credencial?.trim()).map((m) => m.id));
  const cantidad = [...seleccion].filter((id) => elegibles.has(id)).length;
  const todas = elegibles.size > 0 && cantidad === elegibles.size;

  return (
    <form method="post" action="/admin/credenciales/pdf" target="_blank" className="stack">
      <div className="card stack">
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={todas} disabled={!elegibles.size}
            ref={(input) => { if (input) input.indeterminate = cantidad > 0 && !todas; }}
            onChange={(e) => seleccionar(e.target.checked ? elegibles : new Set())} />
          Seleccionar todas las coincidencias para imprimir credenciales
        </label>
        <p role="status">{cantidad} de {elegibles.size} seleccionadas · {filas.length} {filas.length === 1 ? "ficha encontrada" : "fichas encontradas"}</p>
        {elegibles.size < filas.length && <p className="hint">Para imprimir, la ficha debe estar activa y tener rótulo de credencial.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button name="formato" value="a4" disabled={!cantidad}>Abrir PDF A4</button>
          <button name="formato" value="individual" className="secondary" disabled={!cantidad}>
            {cantidad > 1 ? "Descargar ZIP de PDFs" : "Abrir PDF individual"}
          </button>
          <button type="button" className="quiet" disabled={!cantidad} onClick={() => seleccionar(new Set())}>Quitar selección</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th scope="col" className="p-2"><span className="sr-only">Seleccionar</span></th>
              <th scope="col" className="p-2">Junta</th>
              <th scope="col" className="p-2">Persona</th>
              <th scope="col" className="p-2">Cargo</th>
              <th scope="col" className="p-2">Estado</th>
              <th scope="col" className="p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((m) => {
              const activaConRotulo = elegibles.has(m.id);
              const nombre = `${m.apellidos}, ${m.nombres}`;
              return (
                <tr key={m.id} className="border-b">
                  <td className="p-2">
                    <input type="checkbox" name="ids" value={m.id} aria-label={`Seleccionar a ${nombre}`}
                      checked={activaConRotulo && seleccion.has(m.id)} disabled={!activaConRotulo} onChange={(e) => {
                        const marcada = e.target.checked;
                        seleccionar((anterior) => {
                          const ids = new Set(anterior);
                          if (marcada) ids.add(m.id);
                          else ids.delete(m.id);
                          return ids;
                        });
                      }} />
                  </td>
                  <td className="p-2 font-semibold">{m.origen}{m.vigente !== m.origen ? ` → ${m.vigente}` : ""}</td>
                  <td className="p-2"><Link className="underline" href={`/admin/mjrv/${m.id}`}>{nombre}</Link><div className="text-slate-600">{m.cedula}{m.es_prueba ? " · PRUEBA" : ""}</div></td>
                  <td className="p-2">{m.rol}</td>
                  <td className="p-2">
                    {!m.activo ? "De baja" : m.ingresado ? "Ingresó" : "Sin ingresar"}
                    {m.activo && !activaConRotulo && <span className="block hint">Sin rótulo</span>}
                  </td>
                  <td className="p-2"><Link className="underline" href={`/admin/mjrv/${m.id}`}>Editar</Link> · <Link className="underline" href={`/admin/mjrv/${m.id}#borrar`}>Borrar</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </form>
  );
}
