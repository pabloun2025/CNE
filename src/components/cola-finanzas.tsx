"use client";

import Link from "next/link";
import { useState } from "react";
import { useSondeo } from "./sondeo";

type Escaneado = {
  mjrvId: number; cedula: string; nombre: string; junta: string; escaneadoEn: string;
  emitido: boolean; actaId: number | null;
};

export function ColaFinanzas({ etapa }: { etapa: "impresion" | "caja" }) {
  const caja = etapa === "caja";
  const { datos, falla } = useSondeo<{ modo: "prueba" | "eleccion"; escaneados: Escaneado[] }>(
    `/api/admin/finanzas/escaneados?etapa=${etapa}`, 4000,
  );
  const [q, setQ] = useState("");
  const [cedulaAbierta, setCedulaAbierta] = useState("");
  const disponibles = [...(datos?.escaneados ?? [])]
    .sort((a, b) => new Date(a.escaneadoEn).getTime() - new Date(b.escaneadoEn).getTime());
  const filas = disponibles.filter((f) => `${f.nombre} ${f.cedula} ${f.junta}`.toLocaleLowerCase("es").includes(q.trim().toLocaleLowerCase("es")));

  return (
    <section className="card stack">
      <h2>{caja ? "Para pagar" : "Para imprimir"}</h2>
      {falla && <p role="status">La lista no se pudo actualizar. Reintentando…</p>}
      {!datos && !falla && <p>Cargando cola…</p>}
      {datos && !disponibles.length && <p>{caja ? "Aún no hay recibos remitidos a Caja." : "Aún no hay fichas validadas en la cola de Impresión."}</p>}
      {!!disponibles.length && (
        <>
          <label>Filtrar por nombre, cédula o junta
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <ul className="max-h-96 divide-y overflow-y-auto">
            {filas.map((f) => (
              <li key={f.mjrvId} className="py-2">
                <Link href={{ pathname: caja ? "/admin/finanzas/caja" : "/admin/finanzas/pagar", query: { cedula: f.cedula } }}
                  onClick={() => setCedulaAbierta(f.cedula)} aria-current={cedulaAbierta === f.cedula ? "true" : undefined}>{f.nombre}</Link>
                <p className="text-sm">{f.junta} · {f.cedula}</p>
              </li>
            ))}
          </ul>
          {!filas.length && <p>El filtro no tiene coincidencias.</p>}
        </>
      )}
    </section>
  );
}
