"use client";

import { useState } from "react";
import { filtrarJuntas, gruposInfograma, type Filtro, type JuntaMando, type Indicadores } from "@/domain/mando";
import { ZONA_HEX, type ZonaColor } from "@/domain/juntas";
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
  const grupos = gruposInfograma(lista);
  const i = datos.indicadores;
  return (
    <div className="space-y-3">
      <dl className="indicadores" aria-label="Indicadores">
        {[["Ingresados", `${i.ingresados} / ${i.total}`], ["Juntas completas", i.completas], ["Incompletas", i.incompletas], ["Sin nadie", i.sinNadie], ["Suplentes transferibles", i.transferibles]].map(([t, v]) => (
          <div key={String(t)}><dt>{t}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      <p className={`text-xs ${falla ? "font-bold text-red-700" : "text-slate-600"}`}>{falla ? `Sin actualizar desde ${ultima ? horaCorta(ultima) : "—"}` : `Actualizado ${ultima ? horaCorta(ultima) : ""}`}</p>

      <TarjetaPropuesta onCambio={refrescar} />
      <button onClick={() => setIncorporando(true)} className="border-2 border-stone-900 px-4 py-3">Incorporar votante</button>

      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => <button key={f.id} onClick={() => setFiltro(f.id)} aria-pressed={filtro === f.id} className={`border-2 px-3 py-2 text-sm ${filtro === f.id ? "border-stone-900 bg-stone-900 text-white" : "border-stone-900 bg-white"}`}>{f.texto}</button>)}
      </div>

      {lista.length === 0 && <p>No hay juntas con este filtro.</p>}
      {grupos.map((g) => (
        <section key={g.zona}>
          <h2 className="mb-1 mt-2">{g.titulo} ({g.fichas.length})</h2>
          <div className="fila-fichas">
            {g.fichas.map((j) => (
              <button key={j.id} onClick={() => setAbierta(j.id)} className="ficha" style={{ background: ZONA_HEX[j.zona], color: TEXTO_ZONA[j.zona], boxShadow: `0 0 0 2px #fff, 0 0 0 5px ${ARO[j.estado]}` }}>
                <span className="ficha-serie">{j.serie}</span>
                {j.movimiento && <span className="ficha-marca" title="Hubo traslado" aria-label="Hubo traslado">⇄</span>}
                <span className="ficha-num">{j.numero}</span>
                <span className="ficha-estado">{j.texto}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {incorporando && <FormIncorporar juntas={datos.juntas} onCerrar={() => setIncorporando(false)} onCambio={refrescar} />}
      {abierta !== null && <FichaJunta juntaId={abierta} onCerrar={() => setAbierta(null)} onCambio={refrescar} />}
    </div>
  );
}
