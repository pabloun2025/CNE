"use client";

import { useState } from "react";
import type { ResumenFinanzas } from "@/server/finanzas-resumen";
import { horaCorta, useSondeo } from "./sondeo";

const ESTADO: Record<string, string> = { pagada: "Pagada", acta_preparada: "Acta preparada", lista: "Lista", documentacion_incompleta: "Documentación incompleta" };
const hora = (t: string) => new Date(t).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" });

// Sondeo de 5 s. Refleja confirmaciones efectivas, no actas impresas.
export function PanelFinanciero() {
  const { datos, ultima, falla } = useSondeo<ResumenFinanzas>("/api/admin/finanzas/resumen", 5000);
  const [filtro, setFiltro] = useState("");
  const [q, setQ] = useState("");
  if (!datos) return <p>{falla ? "No se pudo cargar el panel. Reintentando…" : "Cargando…"}</p>;
  const filas = datos.filas.filter((f) => (!filtro || f.estado === filtro) && (!q.trim() || `${f.nombre} ${f.cedula}`.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <div className="space-y-3">
      {datos.modoPrueba && <p className="rounded bg-red-100 p-2 text-sm font-semibold text-red-900">Modo prueba: los pagos y los importes son simulados.</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Pagados", datos.pagados], ["Pendientes", datos.pendientes], ["Documentación incompleta", datos.documentacionIncompleta], ["Total entregado USD", datos.totalUsd]].map(([t, v]) => (
          <div key={String(t)} className="rounded border bg-slate-50 p-2 text-center"><div className="text-2xl font-bold">{v}</div><div className="text-xs">{t}</div></div>
        ))}
      </div>
      <p className={`text-xs ${falla ? "font-bold text-red-700" : "text-slate-600"}`}>{falla ? `Sin actualizar desde ${ultima ? horaCorta(ultima) : "—"}` : `Actualizado ${ultima ? horaCorta(ultima) : ""}`}</p>
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Apellidos o cédula" className="rounded border border-slate-400 px-2 py-2" />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="rounded border border-slate-400 px-2 py-2">
          <option value="">Todos los estados</option>{Object.entries(ESTADO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {filas.length === 0 ? <p>No hay personas con ese criterio.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b"><th className="p-2">Persona</th><th className="p-2">Junta</th><th className="p-2">Estado</th><th className="p-2">USD</th><th className="p-2">Hora y operador</th></tr></thead>
            <tbody>{filas.slice(0, 700).map((f) => (
              <tr key={f.id} className="border-b">
                <td className="p-2">{f.nombre}<div className="text-slate-600">{f.cedula}</div></td>
                <td className="p-2">{f.junta}</td>
                <td className="p-2">{ESTADO[f.estado]}{f.simulado ? " (simulado)" : ""}</td>
                <td className="p-2">{f.usd ?? "—"}</td>
                <td className="p-2">{f.hora ? `${hora(f.hora)} · ${f.operador}` : "—"}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
