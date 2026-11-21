"use client";

import { useEffect, useRef, useState } from "react";
import { filtrarJuntas, gruposMapaMadrid, type Filtro, type JuntaMando, type Indicadores } from "@/domain/mando";
import { ZONA_HEX, ZONA_NOMBRE, ZONAS, type ZonaColor } from "@/domain/juntas";
import type { Modo } from "@/server/config";
import { horaCorta, useSondeo } from "./sondeo";
import { FichaJunta } from "./ficha-junta";
import { FormIncorporar } from "./form-incorporar";
import { TarjetaPropuesta } from "./tarjeta-propuesta";
import estilos from "./centro-mando.module.css";

type Estado = { generado_en: string; indicadores: Indicadores; juntas: JuntaMando[]; modo: Modo };

const ARO = { nadie: "#dc2626", faltan: "#d97706", completa: "#15803d" } as const;
const FILTROS: { id: Filtro; texto: string }[] = [
  { id: "todas", texto: "Todos los estados" }, { id: "faltan", texto: "Faltan miembros" },
  { id: "completas", texto: "Completas" }, { id: "transferibles", texto: "Con suplentes transferibles" },
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

function TarjetaJunta({ junta: j, abrir, resumida = false }: {
  junta: JuntaMando; abrir: (id: number) => void; resumida?: boolean;
}) {
  const estado = j.estado === "completa" ? "Completa" : j.estado === "nadie" ? "Sin nadie" : "Incompleta";
  return (
    <button type="button" className={estilos.tarjeta} aria-label={etiquetaFicha(j)}
      onClick={(e) => { e.currentTarget.focus(); abrir(j.id); }}>
      <span className={estilos.cabeceraJunta}>
        <strong>{j.serie}{j.numero}</strong>
        <span aria-hidden="true" className={estilos.estadoJunta} style={{ background: ARO[j.estado] }} title={estado} />
        {j.movimiento && <span aria-hidden="true" className={estilos.marca} title="Hubo traslado">⇄</span>}
      </span>
      {resumida ? <span className={estilos.resumenCuentas}>{j.presentes} / {j.faltan}</span> : (
        <span className={estilos.cuentas}>
          <span><b>{j.presentes}</b> <small>Presentes</small></span>
          <span><b>{j.faltan}</b> <small>Faltan</small></span>
        </span>
      )}
    </button>
  );
}

function MapaJuntas({ grupos, abrir }: {
  grupos: ReturnType<typeof gruposMapaMadrid>;
  abrir: (id: number) => void;
}) {
  return (
    <div className={estilos.resumen} role="region" aria-label="Mapa de juntas de Madrid">
      {grupos.map((grupo) => (
        <section key={grupo.zona} className={estilos.grupoResumen} aria-label={grupo.titulo}>
          <h3><span aria-hidden="true" className={estilos.colorZona} style={{ background: ZONA_HEX[grupo.zona] }} />{grupo.titulo}</h3>
          <div className={estilos.cuadriculaResumen}>
            {grupo.filas.flat().map((j) => <TarjetaJunta key={j.id} junta={j} abrir={abrir} resumida />)}
          </div>
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
  const [zona, setZona] = useState<ZonaColor>("amarillo");
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
  const grupos = gruposMapaMadrid(datos.juntas);
  const grupoActivo = grupos.find((g) => g.zona === zona);
  const visibles = new Set(filtrarJuntas(datos.juntas, filtro).map((j) => j.id));
  const juntasZona = grupoActivo?.filas.flat() ?? [];
  const lista = juntasZona.filter((j) => visibles.has(j.id));
  const actualizacion = falla ? `Sin actualizar desde ${ultima ? horaCorta(ultima) : "—"}` : `Actualizado ${ultima ? horaCorta(ultima) : ""}`;
  const estadoActualizacion = falla ? "font-bold text-red-700" : "text-slate-600";
  return (
    <div className="stack-lg">
      <CifrasMando indicadores={datos.indicadores} className={estilos.indicadores} />
      <div className={estilos.linea}>
        <p className={`text-sm ${estadoActualizacion}`} role={falla ? "status" : undefined}>{actualizacion}</p>
        <button ref={botonPantalla} type="button" className="quiet" onClick={activarPantalla}>Vista general de las 95 juntas</button>
      </div>

      <section className={estilos.trabajo} aria-label="Juntas por zona">
        <div className={estilos.selectorZonas} role="group" aria-label="Seleccionar zona">
          {ZONAS.map((color) => (
            <button key={color} type="button" className={estilos.zonaBoton} aria-pressed={zona === color}
              onClick={() => { setZona(color); setAbierta(null); }}>
              <span aria-hidden="true" className={estilos.colorZona} style={{ background: ZONA_HEX[color] }} />
              {ZONA_NOMBRE[color]}
            </button>
          ))}
        </div>
        <div className={estilos.zonaActiva} style={{ borderTopColor: ZONA_HEX[zona] }}>
          <div className={estilos.cabeceraZona}>
            <div>
              <h2>{grupoActivo?.titulo ?? ZONA_NOMBRE[zona]}</h2>
              <p>{juntasZona.length} juntas · {juntasZona.filter((j) => j.estado === "completa").length} completas</p>
            </div>
            <label className={estilos.filtro}>
              Estado de la junta
              <select value={filtro} onChange={(e) => setFiltro(e.target.value as Filtro)}>
                {FILTROS.map((f) => <option key={f.id} value={f.id}>{f.texto}</option>)}
              </select>
            </label>
          </div>
          {lista.length === 0 ? <p className="empty">No hay juntas de esta zona con ese estado.</p> : (
            <div className={estilos.cuadricula} role="region" aria-label="Juntas de la zona seleccionada">
              {lista.map((j) => <TarjetaJunta key={j.id} junta={j} abrir={setAbierta} />)}
            </div>
          )}
        </div>
      </section>
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
                <p>Presentes / faltan</p>
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
