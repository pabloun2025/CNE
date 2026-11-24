"use client";

import { useState, useTransition } from "react";
import { aplicarImportacionAccion, revisarImportacion, type RespuestaAplicar, type RespuestaVista } from "@/server/importar-actions";

export function ImportadorMjrv() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<RespuestaVista | null>(null);
  const [resultado, setResultado] = useState<RespuestaAplicar | null>(null);
  const [bajas, setBajas] = useState<Set<number>>(new Set());
  const [pendiente, iniciar] = useTransition();

  const datos = () => {
    const f = new FormData();
    if (archivo) f.set("archivo", archivo);
    for (const id of bajas) f.append("baja", String(id));
    return f;
  };
  const revisar = () => iniciar(async () => { setResultado(null); setBajas(new Set()); setVista(await revisarImportacion(datos())); });
  const aplicar = () => iniciar(async () => { setResultado(await aplicarImportacionAccion(datos())); setVista(null); });

  const v = vista?.ok ? vista.vista : null;
  const conProblemas = v?.filas.filter((f) => f.errores.length || f.advertencias.length) ?? [];
  return (
    <div className="space-y-4">
      <p className="text-sm">Columnas: cédula, apellidos, nombres, cargo, serie (M o F), junta, correo y teléfono. <a className="underline" href="/plantillas/mjrv.xlsx">Descargar plantilla</a>.</p>
      <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setVista(null); setResultado(null); }} className="block w-full text-base" />
      <button onClick={revisar} disabled={!archivo || pendiente} className="rounded bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60">Revisar archivo</button>

      {vista && !vista.ok && <p role="alert" className="font-medium text-red-700">{vista.mensaje}</p>}
      {resultado && (resultado.ok
        ? <p role="status" className="font-medium text-green-800">Listo: {resultado.nuevas} nuevas, {resultado.actualizadas} actualizadas, {resultado.bajas} dadas de baja.</p>
        : <p role="alert" className="font-medium text-red-700">{resultado.mensaje}</p>)}

      {v && (
        <div className="space-y-3">
          <p>{v.filas.length} filas · <strong>{v.validas} válidas</strong> · {v.errores} con errores · {v.advertencias} con advertencias · {v.nuevas} nuevas · {v.actualizadas} se actualizarán.</p>
          <p role="note" className="rounded border-2 border-amber-600 bg-amber-50 p-3 text-base font-semibold text-amber-900">La letra de la junta es M para masculino y F para femenino. Resultado: {v.porSerie.H} fichas en juntas M y {v.porSerie.M} en juntas F. Compruebe que es correcto antes de aplicar.</p>
          {v.avisosJunta.length > 0 && <ul className="list-disc pl-5 text-sm text-amber-800">{v.avisosJunta.map((a) => <li key={a}>{a}</li>)}</ul>}
          {conProblemas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left"><th className="p-1">Fila</th><th className="p-1">Cédula</th><th className="p-1">Problemas</th></tr></thead>
                <tbody>{conProblemas.slice(0, 300).map((f) => (
                  <tr key={f.datos.fila} className="border-t align-top">
                    <td className="p-1">{f.datos.fila}</td><td className="p-1">{f.datos.cedula}</td>
                    <td className="p-1">{f.errores.map((e) => <div key={e} className="font-medium text-red-700">Error: {e}</div>)}{f.advertencias.map((e) => <div key={e} className="text-amber-800">Aviso: {e}</div>)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
          {v.ausentes.length > 0 && (
            <fieldset className="rounded border p-3">
              <legend className="px-1 text-sm font-semibold">No están en el archivo ({v.ausentes.length}). Marque a quienes quiera dar de baja; las demás no cambian.</legend>
              <div className="max-h-60 overflow-y-auto">{v.ausentes.map((a) => (
                <label key={a.id} className="flex items-center gap-2 py-1 text-sm">
                  <input type="checkbox" checked={bajas.has(a.id)} onChange={(e) => setBajas((s) => { const n = new Set(s); if (e.target.checked) n.add(a.id); else n.delete(a.id); return n; })} />
                  {a.apellidos}, {a.nombres} ({a.cedula})
                </label>))}</div>
            </fieldset>
          )}
          <button onClick={aplicar} disabled={v.errores > 0 || v.filas.length === 0 || pendiente} className="rounded bg-green-700 px-4 py-3 font-semibold text-white disabled:opacity-60">
            Aplicar importación
          </button>
          {v.errores > 0 && <p className="text-sm font-medium text-red-700">Hay errores: no se puede aplicar hasta corregirlos.</p>}
        </div>
      )}
    </div>
  );
}
