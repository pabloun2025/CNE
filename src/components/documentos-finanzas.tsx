"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { EstadoDocs, LadoDocumento } from "@/domain/documentos";
import type { Modo } from "@/server/config";
import type { FichaDocumentosFinanzas } from "@/server/documentos";
import { CapturaDocumentosPuesto } from "./captura-cedula";

const FILTROS = [
  { id: "pendientes", etiqueta: "Pendientes" },
  { id: "completos", etiqueta: "Completos" },
  { id: "todos", etiqueta: "Todos" },
] as const;
type Filtro = typeof FILTROS[number]["id"];

const FOTOS = [
  { lado: "anverso", texto: "Cédula · Anverso" },
  { lado: "reverso", texto: "Cédula · Reverso" },
  { lado: "pasaporte", texto: "Pasaporte · Página de datos" },
] as const;

const normalizar = (texto: string) => texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es");
const estado = (f: EstadoDocs) => f.completos ? "Completo" : f.anverso || f.reverso ? "Falta una cara" : "Sin fotos";

export function DocumentosFinanzas({ fichas, modo }: { fichas: FichaDocumentosFinanzas[]; modo: Modo }) {
  const router = useRouter();
  const [refrescando, refrescar] = useTransition();
  const [actualizadas, setActualizadas] = useState<Record<number, EstadoDocs>>({});
  const [filtro, setFiltro] = useState<Filtro>("pendientes");
  const [busqueda, setBusqueda] = useState("");
  const [junta, setJunta] = useState("");
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const panel = useRef<HTMLElement>(null);
  const personas = fichas.map((f) => ({ ...f, ...actualizadas[f.id] }));
  const completas = personas.filter((f) => f.completos).length;
  const totales = { pendientes: personas.length - completas, completos: completas, todos: personas.length };
  const juntas = [...new Set(fichas.map((f) => f.junta))];
  const terminos = normalizar(busqueda.trim()).split(/\s+/).filter(Boolean);
  const visibles = personas.filter((f) =>
    (filtro === "todos" || f.completos === (filtro === "completos"))
    && (!junta || junta === f.junta)
    && terminos.every((parte) => normalizar(`${f.nombre} ${f.cedula}`).includes(parte)));
  const elegida = personas.find((f) => f.id === seleccion);

  function abrir(id: number) {
    setSeleccion(id);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => panel.current?.focus());
    }
  }

  return (
    <>
      <section className="card stack" aria-label="Filtrar documentos">
        <div className="flex flex-wrap gap-2">
          {FILTROS.map(({ id, etiqueta }) => (
            <button key={id} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(id)}
              className={filtro === id ? "button-like" : "button-like secondary"}>{etiqueta} ({totales[id]})</button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-48 flex-1">Nombre, apellido o cédula
            <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} maxLength={120} autoComplete="off" />
          </label>
          <label>Junta de origen
            <select value={junta} onChange={(e) => setJunta(e.target.value)}>
              <option value="">Todas las juntas</option>
              {juntas.map((j) => <option key={j}>{j}</option>)}
            </select>
          </label>
          <button className="button-like secondary" type="button" disabled={refrescando} onClick={() => refrescar(() => {
            setActualizadas({});
            router.refresh();
          })}>{refrescando ? "Actualizando…" : "Actualizar lista"}</button>
        </div>
      </section>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="card stack min-w-0" aria-label="Lista de MJRV">
          <p role="status">{visibles.length} {visibles.length === 1 ? "ficha" : "fichas"}</p>
          {!visibles.length ? <p>No hay fichas con estos filtros.</p> : (
            <ul className="max-h-[65vh] divide-y overflow-y-auto">
              {visibles.map((f) => (
                <li key={f.id}>
                  <button type="button" aria-pressed={seleccion === f.id} onClick={() => abrir(f.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded px-3 py-3 text-left shadow-none aria-pressed:bg-blue-50">
                    <span className="min-w-0 break-words font-semibold">{f.nombre}<span className="block text-sm font-normal">Junta {f.junta} · {f.cedula}</span></span>
                    <span className={f.completos ? "text-sm font-medium text-green-800" : "text-sm font-medium text-amber-900"}>{estado(f)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card stack min-w-0" ref={panel} tabIndex={-1} aria-label="Vista previa y captura">
          {elegida ? (
            <DetalleDocumento key={elegida.id} ficha={elegida} modo={modo}
              onGuardar={(nuevo) => setActualizadas((previas) => ({ ...previas, [elegida.id]: nuevo }))} />
          ) : <p>Seleccione a un MJRV para ver sus fotos o completar la captura.</p>}
        </section>
      </div>
    </>
  );
}

function DetalleDocumento({ ficha, modo, onGuardar }: { ficha: FichaDocumentosFinanzas; modo: Modo; onGuardar: (estado: EstadoDocs) => void }) {
  const [mensaje, setMensaje] = useState("");
  const [revision, setRevision] = useState(0);

  async function subir(lado: LadoDocumento, imagen: Blob): Promise<boolean> {
    const datos = new FormData();
    datos.set("mjrvId", String(ficha.id));
    datos.set("modo", modo);
    datos.set("lado", lado);
    datos.set("imagen", imagen, `${lado}.jpg`);
    setMensaje("");
    try {
      const respuesta = await fetch("/api/admin/finanzas/foto", { method: "POST", body: datos });
      if (!respuesta.ok) throw new Error((await respuesta.json().catch(() => null))?.error ?? "No se pudo guardar la foto.");
      const { anverso, reverso, completos, pasaporte } = await respuesta.json() as EstadoDocs;
      setRevision((v) => v + 1);
      onGuardar({ anverso, reverso, completos, pasaporte });
      setMensaje(completos ? "Documento completo. Puede pasar a revisión." : "Foto guardada.");
      return true;
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "No se pudo guardar la foto.");
      return false;
    }
  }

  const fotos = FOTOS.filter(({ lado }) => ficha[lado]);
  return (
    <>
      <div>
        <h2>{ficha.nombre}</h2>
        <p>Junta {ficha.junta} · {estado(ficha)}</p>
      </div>
      {fotos.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {fotos.map(({ lado, texto }) => {
            const url = `/api/admin/finanzas/cedula/${ficha.id}/${lado}?modo=${modo}&v=${revision}`;
            return (
              <figure key={lado}>
                <a href={url} target="_blank" rel="noreferrer" aria-label={`Ampliar ${texto}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={texto} className="max-h-64 w-full rounded border bg-slate-50 object-contain" />
                </a>
                <figcaption className="text-sm">{texto}</figcaption>
              </figure>
            );
          })}
        </div>
      )}
      {mensaje && <p role="status">{mensaje}</p>}
      {ficha.completos ? (
        <Link className="button-like secondary" href={{ pathname: "/admin/finanzas/pagar", query: { cedula: ficha.cedula } }}>Ir a Revisar e imprimir</Link>
      ) : (
        <CapturaDocumentosPuesto fotos={ficha} onUsar={subir} seguirConReverso />
      )}
    </>
  );
}
