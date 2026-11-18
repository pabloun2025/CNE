"use client";

import { useState } from "react";
import { filtrarJuntas, type Filtro, type JuntaMando, type Indicadores } from "@/domain/mando";
import { ZONA_HEX, ZONA_NOMBRE, type ZonaColor } from "@/domain/juntas";
import { horaCorta, useSondeo } from "./sondeo";
import { FichaJunta } from "./ficha-junta";
import { TarjetaPropuesta } from "./tarjeta-propuesta";

type Estado = { generado_en: string; indicadores: Indicadores; juntas: JuntaMando[] };

const COLOR_ESTADO = { nadie: "bg-red-100 text-red-900 border-red-600", faltan: "bg-amber-100 text-amber-900 border-amber-600", completa: "bg-green-100 text-green-900 border-green-700" } as const;
const ICONO = { nadie: "✖", faltan: "▲", completa: "✔" } as const;
const FILTROS: { id: Filtro; texto: string }[] = [
  { id: "faltan", texto: "Faltan miembros" }, { id: "transferibles", texto: "Con suplentes transferibles" }, { id: "completas", texto: "Completas" }, { id: "todas", texto: "Todas" },
];

export function CentroMando() {
  const { datos, ultima, falla, refrescar } = useSondeo<Estado>("/api/mando/estado", 3000);
  const [filtro, setFiltro] = useState<Filtro>("faltan");
  const [agrupar, setAgrupar] = useState<"ninguno" | "zona" | "serie">("ninguno");
  const [abierta, setAbierta] = useState<number | null>(null);

  if (!datos) return <p>{falla ? "No se pudo cargar el centro de mando. Reintentando…" : "Cargando…"}</p>;
  const lista = filtrarJuntas(datos.juntas, filtro);
  const grupos: { titulo: string; juntas: JuntaMando[] }[] =
    agrupar === "zona" ? (Object.keys(ZONA_NOMBRE) as ZonaColor[]).map((z) => ({ titulo: ZONA_NOMBRE[z], juntas: lista.filter((j) => j.zona === z) })).filter((g) => g.juntas.length)
    : agrupar === "serie" ? [{ titulo: "Hombres (H)", juntas: lista.filter((j) => j.serie === "H") }, { titulo: "Mujeres (M)", juntas: lista.filter((j) => j.serie === "M") }].filter((g) => g.juntas.length)
    : [{ titulo: "", juntas: lista }];
  const i = datos.indicadores;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Indicadores">
        {[["Ingresados", `${i.ingresados} / ${i.total}`], ["Juntas completas", i.completas], ["Incompletas", i.incompletas], ["Sin nadie", i.sinNadie], ["Suplentes transferibles", i.transferibles]].map(([t, v]) => (
          <div key={String(t)} className="rounded border bg-slate-50 p-2 text-center"><div className="text-2xl font-bold">{v}</div><div className="text-xs">{t}</div></div>
        ))}
      </div>
      <p className={`text-xs ${falla ? "font-bold text-red-700" : "text-slate-600"}`}>{falla ? `Sin actualizar desde ${ultima ? horaCorta(ultima) : "—"}` : `Actualizado ${ultima ? horaCorta(ultima) : ""}`}</p>

      <TarjetaPropuesta onCambio={refrescar} />

      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => <button key={f.id} onClick={() => setFiltro(f.id)} aria-pressed={filtro === f.id} className={`rounded border px-3 py-2 text-sm font-semibold ${filtro === f.id ? "border-blue-700 bg-blue-700 text-white" : "border-slate-400"}`}>{f.texto}</button>)}
        <label className="ml-auto text-sm">Agrupar por <select value={agrupar} onChange={(e) => setAgrupar(e.target.value as typeof agrupar)} className="rounded border border-slate-400 px-2 py-2"><option value="ninguno">nada</option><option value="zona">zona</option><option value="serie">serie</option></select></label>
      </div>

      {lista.length === 0 && <p>No hay juntas con este filtro.</p>}
      {grupos.map((g) => (
        <section key={g.titulo}>
          {g.titulo && <h2 className="mb-1 mt-2 font-semibold">{g.titulo} ({g.juntas.length})</h2>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {g.juntas.map((j) => (
              <button key={j.id} onClick={() => setAbierta(j.id)} className={`overflow-hidden rounded border-2 text-left ${COLOR_ESTADO[j.estado]}`}>
                <div className="h-2" style={{ background: ZONA_HEX[j.zona] }} aria-hidden />
                <div className="p-2">
                  <div className="flex items-baseline justify-between"><span className="text-xl font-extrabold">{j.serie}{j.numero}</span>{j.movimiento && <span title="Hubo traslado" aria-label="Hubo traslado">⇄</span>}</div>
                  <div className="text-sm font-semibold">{ICONO[j.estado]} {j.texto}</div>
                  <div className="text-xs">{ZONA_NOMBRE[j.zona]}{j.transferibles > 0 ? ` · ${j.transferibles} transf.` : ""}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
      {abierta !== null && <FichaJunta juntaId={abierta} onCerrar={() => setAbierta(null)} onCambio={refrescar} />}
    </div>
  );
}
