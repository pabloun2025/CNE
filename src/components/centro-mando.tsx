"use client";

import { useState } from "react";
import { filtrarJuntas, type Filtro, type JuntaMando, type Indicadores } from "@/domain/mando";
import { dosFilas, ZONA_HEX, ZONA_NOMBRE, ZONAS, type ZonaColor } from "@/domain/juntas";
import { horaCorta, useSondeo } from "./sondeo";
import { FichaJunta } from "./ficha-junta";
import { FormIncorporar } from "./form-incorporar";
import { TarjetaPropuesta } from "./tarjeta-propuesta";

type Estado = { generado_en: string; indicadores: Indicadores; juntas: JuntaMando[] };

const ARO = { nadie: "#dc2626", faltan: "#d97706", completa: "#15803d" } as const;
const TEXTO_ZONA: Record<ZonaColor, string> = { amarillo: "#1a1a1a", azul: "#ffffff", rojo: "#ffffff", celeste: "#1a1a1a", verde: "#ffffff", rosado: "#1a1a1a" };
const FILTROS: { id: Filtro; texto: string }[] = [
  { id: "faltan", texto: "Faltan miembros" }, { id: "transferibles", texto: "Con suplentes transferibles" }, { id: "completas", texto: "Completas" }, { id: "todas", texto: "Todas" },
];

export function CentroMando() {
  const { datos, ultima, falla, refrescar } = useSondeo<Estado>("/api/mando/estado", 3000);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [abierta, setAbierta] = useState<number | null>(null);
  const [incorporando, setIncorporando] = useState(false);

  if (!datos) return <p>{falla ? "No se pudo cargar el centro de mando. Reintentando…" : "Cargando…"}</p>;
  const lista = filtrarJuntas(datos.juntas, filtro);
  const grupos = ZONAS.map((z) => ({ zona: z, titulo: ZONA_NOMBRE[z], filas: dosFilas(lista.filter((j) => j.zona === z).sort((a, b) => a.numero - b.numero)) })).filter((g) => g.filas.length > 0);
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
      <button onClick={() => setIncorporando(true)} className="rounded border-2 border-blue-700 px-4 py-3 font-semibold text-blue-800">Incorporar votante</button>

      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => <button key={f.id} onClick={() => setFiltro(f.id)} aria-pressed={filtro === f.id} className={`rounded border px-3 py-2 text-sm font-semibold ${filtro === f.id ? "border-blue-700 bg-blue-700 text-white" : "border-slate-400"}`}>{f.texto}</button>)}
      </div>

      {lista.length === 0 && <p>No hay juntas con este filtro.</p>}
      {grupos.map((g) => (
        <section key={g.zona}>
          {g.zona === "rosado" && <p className="mb-1 mt-3 text-sm font-semibold">Entrada</p>}
          <h2 className="mb-1 mt-2 font-semibold">{g.titulo} ({g.filas.reduce((n, f) => n + f.length, 0)})</h2>
          {g.filas.map((fila, i) => (
            <div key={i} className="mb-2 flex flex-wrap gap-2">
              {fila.map((j) => (
                <button key={j.id} onClick={() => setAbierta(j.id)} className="w-24 rounded p-2 text-left" style={{ background: ZONA_HEX[j.zona], color: TEXTO_ZONA[j.zona], boxShadow: `0 0 0 2px #fff, 0 0 0 5px ${ARO[j.estado]}` }}>
                  <div className="flex items-baseline justify-between"><span className="text-xl font-extrabold">{j.serie}{j.numero}</span>{j.movimiento && <span title="Hubo traslado" aria-label="Hubo traslado">⇄</span>}</div>
                  <div className="text-xs font-semibold">{j.texto}</div>
                </button>
              ))}
            </div>
          ))}
        </section>
      ))}
      {incorporando && <FormIncorporar juntas={datos.juntas} onCerrar={() => setIncorporando(false)} onCambio={refrescar} />}
      {abierta !== null && <FichaJunta juntaId={abierta} onCerrar={() => setAbierta(null)} onCambio={refrescar} />}
    </div>
  );
}
