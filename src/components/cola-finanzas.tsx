"use client";

import Link from "next/link";
import { useState } from "react";
import { useSondeo } from "./sondeo";

type Escaneado = { mjrvId: number; cedula: string; nombre: string; junta: string; escaneadoEn: string;
  emitido: boolean; documentado: boolean; actaId: number | null };

export function ColaFinanzas({ caja = false }: { caja?: boolean }) {
  const { datos, falla } = useSondeo<{ modo: "prueba" | "eleccion"; escaneados: Escaneado[] }>(
    `/api/admin/finanzas/escaneados${caja ? "?caja=1" : ""}`, 4000,
  );
  const [seleccion, elegir] = useState<{ modo: "prueba" | "eleccion"; ids: number[] } | null>(null);
  const [q, setQ] = useState("");
  const [cedulaAbierta, setCedulaAbierta] = useState("");
  const disponibles = (datos?.escaneados ?? [])
    .filter((f) => caja || !f.emitido || !f.documentado)
    .sort((a, b) => new Date(a.escaneadoEn).getTime() - new Date(b.escaneadoEn).getTime());
  const filas = disponibles.filter((f) => `${f.nombre} ${f.cedula} ${f.junta}`.toLocaleLowerCase("es").includes(q.trim().toLocaleLowerCase("es")));
  const vigentes = seleccion?.modo === datos?.modo ? seleccion?.ids ?? [] : [];
  const seleccionadas = filas.filter((f) => vigentes.includes(f.mjrvId));
  const todas = !!filas.length && seleccionadas.length === filas.length;
  const actualizar = (ids: number[]) => { if (datos) elegir({ modo: datos.modo, ids }); };

  return (
    <section className="card stack">
      <h2>{caja ? "Recibos listos para cobrar" : "Enviados desde el escáner"}</h2>
      {falla && <p role="status">La lista no se pudo actualizar. Reintentando…</p>}
      {!datos && !falla && <p>Cargando cola…</p>}
      {datos && !disponibles.length && <p>{caja ? "No hay recibos listos." : "Todavía no hay fichas para revisar."}</p>}
      {!!disponibles.length && (
        <form method="post" action={caja ? "/api/admin/finanzas/recibos/descargar" : "/api/admin/finanzas/recibos/emitir"} target="_blank" className="stack">
          <label>Filtrar esta lista<input type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} /></label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={todas} disabled={!filas.length} onChange={(e) => actualizar(e.target.checked ? filas.map((f) => f.mjrvId) : [])} />
              Seleccionar todas las coincidencias
            </label>
            <p role="status">{seleccionadas.length} de {filas.length} seleccionadas</p>
          </div>
          {datos && <input type="hidden" name="modo" value={datos.modo} />}
          {seleccionadas.map((f) => caja
            ? <input key={f.mjrvId} type="hidden" name="recibo" value={`acta-${f.actaId}`} />
            : <input key={f.mjrvId} type="hidden" name="id" value={f.mjrvId} />)}
          <ul className="max-h-96 divide-y overflow-y-auto">
            {filas.map((f) => (
              <li key={f.mjrvId} className="flex items-start gap-3 py-2">
                <input type="checkbox" aria-label={`Seleccionar a ${f.nombre}`} checked={vigentes.includes(f.mjrvId)}
                  onChange={(e) => actualizar(e.target.checked ? [...vigentes, f.mjrvId] : vigentes.filter((id) => id !== f.mjrvId))} />
                <div className="min-w-0">
                  <Link href={{ pathname: caja ? "/admin/finanzas/caja" : "/admin/finanzas/pagar", query: { cedula: f.cedula } }}
                    onClick={() => setCedulaAbierta(f.cedula)} aria-current={cedulaAbierta === f.cedula ? "true" : undefined}>{f.nombre}</Link>
                  <p className="text-sm">{f.junta} · {f.cedula}{!caja && (f.documentado ? " · Documento validado" : " · Documento pendiente")}</p>
                </div>
              </li>
            ))}
          </ul>
          {!filas.length && <p>El filtro no tiene coincidencias.</p>}
          {caja && <label className="flex items-center gap-2"><input type="checkbox" name="anexo" value="1" /> Incluir fotos del documento de identidad</label>}
          <button className={caja ? "button-like" : "button-like secondary"} disabled={!seleccionadas.length || falla}>{caja
            ? `Descargar ${seleccionadas.length > 1 ? "ZIP" : "PDF"}`
            : "Imprimir en contingencia"}</button>
        </form>
      )}
    </section>
  );
}
