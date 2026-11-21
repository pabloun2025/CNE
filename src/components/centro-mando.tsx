"use client";

import { useEffect, useRef, useState } from "react";
import { filtrarJuntas, gruposMapaMadrid, type Filtro, type JuntaMando, type Indicadores } from "@/domain/mando";
import { ZONA_HEX, type ZonaColor } from "@/domain/juntas";
import type { Modo } from "@/server/config";
import { horaCorta, useSondeo } from "./sondeo";
import { FichaJunta } from "./ficha-junta";
import { FormIncorporar } from "./form-incorporar";
import { TarjetaPropuesta } from "./tarjeta-propuesta";
import estilos from "./centro-mando.module.css";

type Estado = { generado_en: string; indicadores: Indicadores; juntas: JuntaMando[]; modo: Modo };

const ARO = { nadie: "#dc2626", faltan: "#d97706", completa: "#15803d" } as const;
const CIFRA = { nadie: "#ffffff", faltan: "#1a1a1a", completa: "#ffffff" } as const;
const TEXTO_ZONA: Record<ZonaColor, string> = { amarillo: "#1a1a1a", azul: "#ffffff", rojo: "#ffffff", celeste: "#1a1a1a", verde: "#ffffff", rosado: "#1a1a1a" };
const FILTROS: { id: Filtro; texto: string }[] = [
  { id: "faltan", texto: "Faltan miembros" }, { id: "transferibles", texto: "Con suplentes transferibles" }, { id: "completas", texto: "Completas" }, { id: "todas", texto: "Todas" },
];

function etiquetaFicha(j: JuntaMando) {
  return `${j.serie}${j.numero}. ${j.presentes} hay, faltan ${j.faltan}${j.movimiento ? ". Hubo traslado" : ""}`;
}

function CifrasMando({ indicadores: i, className }: { indicadores: Indicadores; className: string }) {
  return (
    <dl className={className} aria-label="Indicadores">
      {[["Ingresados", `${i.ingresados} / ${i.total}`], ["Juntas completas", i.completas], ["Incompletas", i.incompletas], ["Sin nadie", i.sinNadie], ["Suplentes transferibles", i.transferibles]].map(([t, v]) => (
        <div key={t}><dt>{t}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

function MapaJuntas({ grupos, visibles, abrir }: {
  grupos: ReturnType<typeof gruposMapaMadrid>;
  visibles?: Set<number>;
  abrir: (id: number) => void;
}) {
  return (
    <div className={estilos.zonas} role="region" aria-label="Mapa de juntas de Madrid">
      {(["este", "norte"] as const).map((vial) => (
        <section key={vial} className={estilos.vial} aria-label={`Vial ${vial}`}>
          <h3>Vial {vial}</h3>
          {grupos.filter((g) => g.vial === vial).map((g) => (
            <div key={g.zona} className={estilos.zona}>
              {g.zona === "rosado" && <p className={estilos.entrada}>Entrada</p>}
              <h4>{g.titulo}</h4>
              {g.filas.map((fila, i) => (
                <div key={i} className={estilos.fila} style={{ gridTemplateColumns: `repeat(${Math.max(...g.filas.map((f) => f.length))}, minmax(0, 1fr))` }}>
                  {fila.map((j) => (
                    <button key={j.id} type="button" className={estilos.tarjeta} aria-label={etiquetaFicha(j)}
                      style={{ background: ZONA_HEX[j.zona], color: TEXTO_ZONA[j.zona], visibility: visibles && !visibles.has(j.id) ? "hidden" : undefined }}
                      onClick={(e) => { e.currentTarget.focus(); abrir(j.id); }}>
                      <span className={estilos.serie}>{j.serie}{j.numero}{j.movimiento && <span aria-hidden="true" title="Hubo traslado" className={estilos.marca}>⇄</span>}</span>
                      <span className={estilos.cuentas} style={{ background: ARO[j.estado], color: CIFRA[j.estado] }}>{j.presentes}/{j.faltan}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export function CentroMando() {
  const { datos, ultima, falla, refrescar } = useSondeo<Estado>("/api/mando/estado", 3000);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [abierta, setAbierta] = useState<number | null>(null);
  const [incorporando, setIncorporando] = useState(false);
  const [abiertaPantalla, setAbiertaPantalla] = useState<number | null>(null);
  const botonPantalla = useRef<HTMLButtonElement>(null);
  const ventana = useRef<HTMLDialogElement>(null);
  const tablero = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let nativa = false;
    function alCambiarPantalla() {
      if (document.fullscreenElement === tablero.current && tablero.current) {
        nativa = true;
      } else if (nativa) {
        nativa = false;
        ventana.current?.close();
      }
    }
    document.addEventListener("fullscreenchange", alCambiarPantalla);
    return () => document.removeEventListener("fullscreenchange", alCambiarPantalla);
  }, []);

  async function activarPantalla() {
    // El diálogo se abre después, encima del elemento que ocupa la pantalla.
    // Si no hay pantalla completa nativa, el diálogo ocupa la ventana.
    if (document.fullscreenEnabled) await tablero.current?.requestFullscreen().catch(() => undefined);
    ventana.current?.showModal();
  }

  async function alCerrarPantalla() {
    setAbiertaPantalla(null);
    if (document.fullscreenElement === tablero.current && tablero.current) {
      await document.exitFullscreen().catch(() => undefined);
    }
    botonPantalla.current?.focus();
  }

  if (!datos) return <p>{falla ? "No se pudo cargar el centro de mando. Reintentando…" : "Cargando…"}</p>;
  const lista = filtrarJuntas(datos.juntas, filtro);
  const grupos = gruposMapaMadrid(datos.juntas);
  const actualizacion = falla ? `Sin actualizar desde ${ultima ? horaCorta(ultima) : "—"}` : `Actualizado ${ultima ? horaCorta(ultima) : ""}`;
  const estadoActualizacion = falla ? "font-bold text-red-700" : "text-slate-600";
  return (
    <div className="space-y-3">
      <CifrasMando indicadores={datos.indicadores} className="indicadores" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs ${estadoActualizacion}`}>Hay / faltan · {actualizacion}</p>
        <button ref={botonPantalla} type="button" className="quiet" onClick={activarPantalla}>Pantalla completa</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => <button key={f.id} onClick={() => setFiltro(f.id)} aria-pressed={filtro === f.id} className={`border-2 px-3 py-2 text-sm ${filtro === f.id ? "border-stone-900 bg-stone-900 text-white" : "border-stone-900 bg-white"}`}>{f.texto}</button>)}
      </div>

      {lista.length === 0 && <p>No hay juntas con este filtro.</p>}
      <MapaJuntas grupos={grupos} visibles={filtro === "todas" ? undefined : new Set(lista.map((j) => j.id))} abrir={setAbierta} />
      <TarjetaPropuesta onCambio={refrescar} />
      <button onClick={() => setIncorporando(true)} className="border-2 border-stone-900 px-4 py-3">Incorporar votante</button>
      {incorporando && <FormIncorporar juntas={datos.juntas} onCerrar={() => setIncorporando(false)} onCambio={refrescar} />}
      {abierta !== null && <FichaJunta juntaId={abierta} onCerrar={() => setAbierta(null)} onCambio={refrescar} />}
      <div ref={tablero}>
        <dialog ref={ventana} className={estilos.pantalla} aria-label="Centro de mando" onClose={(e) => {
          if (e.target === e.currentTarget) alCerrarPantalla();
        }}>
          <div className={estilos.tablero}>
            <div className={estilos.cabecera}>
              <div className={estilos.linea}>
                <h2>Centro de mando</h2>
                <button type="button" className={estilos.salir} onClick={() => ventana.current?.close()}>Salir de pantalla completa</button>
              </div>
              {datos.modo === "prueba" && <p role="status" className={estilos.prueba}>MODO PRUEBA — los datos son simulados</p>}
              <CifrasMando indicadores={datos.indicadores} className={estilos.indicadores} />
              <div className={estilos.linea}>
                <p>Hay / faltan</p>
                <p className={estadoActualizacion}>{actualizacion}</p>
              </div>
            </div>
            <MapaJuntas grupos={grupos} abrir={setAbiertaPantalla} />
            {abiertaPantalla !== null && <FichaJunta juntaId={abiertaPantalla} onCerrar={() => setAbiertaPantalla(null)} onCambio={refrescar} compacta />}
          </div>
        </dialog>
      </div>
    </div>
  );
}
