"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ESTADOS_DOCUMENTO, ORIGEN_DOCUMENTOS, type EstadoDocs, type LadoDocumento } from "@/domain/documentos";
import { Documentacion } from "@/app/e/[token]/trabajo/documentacion";
import type { Modo } from "@/server/config";
import type { FichaDocumentosFinanzas } from "@/server/documentos";
import { CapturaDocumentosPuesto } from "./captura-cedula";
import { RevisionDocumentoFinanzas } from "./revision-documento-finanzas";

const FILTROS = [
  { id: "pendientes", etiqueta: "Pendientes de captura" },
  { id: "por_validar", etiqueta: "Por validar" },
  { id: "del_mjrv", etiqueta: "Del MJRV sin validar" },
  { id: "validado", etiqueta: "Validados" },
  { id: "necesita_repetir", etiqueta: "Necesita repetir" },
  { id: "completos", etiqueta: "Fotos completas" },
  { id: "todos", etiqueta: "Todos" },
] as const;
type Filtro = typeof FILTROS[number]["id"];

const normalizar = (texto: string) => texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es");
function coincide(ficha: FichaDocumentosFinanzas, filtro: Filtro) {
  if (filtro === "todos") return true;
  if (filtro === "pendientes") return !ficha.completos;
  if (filtro === "completos") return ficha.completos;
  if (filtro === "del_mjrv") return ficha.estado !== "validado" && (ficha.origen === "mjrv" || ficha.origen === "mixto");
  return ficha.estado === filtro;
}

function rotulo(ficha: FichaDocumentosFinanzas) {
  return [ESTADOS_DOCUMENTO[ficha.estado], ficha.origen ? ORIGEN_DOCUMENTOS[ficha.origen] : ""].filter(Boolean).join(" · ");
}

export function SeguimientoDocumental({ fichas, modo, validacion = false, token }: {
  fichas: FichaDocumentosFinanzas[]; modo: Modo; validacion?: boolean; token?: string;
}) {
  const router = useRouter();
  const [refrescando, refrescar] = useTransition();
  const [filtro, setFiltro] = useState<Filtro>(validacion ? "por_validar" : "pendientes");
  const [busqueda, setBusqueda] = useState("");
  const [junta, setJunta] = useState("");
  const [seleccion, setSeleccion] = useState<{ id: number; revision: number } | null>(null);
  const panel = useRef<HTMLElement>(null);
  const juntas = [...new Set(fichas.map((f) => f.junta))];
  const terminos = normalizar(busqueda.trim()).split(/\s+/).filter(Boolean);
  const coincidentes = fichas.filter((f) =>
    (!junta || junta === f.junta) && terminos.every((parte) => normalizar(`${f.nombre} ${f.cedula}`).includes(parte)));
  const visibles = coincidentes.filter((f) => coincide(f, filtro));
  const elegida = fichas.find((f) => f.id === seleccion?.id);
  const siguientes = visibles.filter((f) => f.id !== elegida?.id);
  const siguiente = siguientes.find((f) => elegida && fichas.indexOf(f) > fichas.indexOf(elegida)) ?? siguientes[0];

  function actualizarLista() {
    refrescar(() => router.refresh());
  }

  function actualizarVista() {
    setSeleccion((actual) => actual && { ...actual, revision: actual.revision + 1 });
    actualizarLista();
  }

  function abrir(id: number) {
    setSeleccion((actual) => ({ id, revision: (actual?.revision ?? 0) + 1 }));
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
              className={filtro === id ? "button-like" : "button-like secondary"}>{etiqueta} ({coincidentes.filter((f) => coincide(f, id)).length})</button>
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
          <button className="button-like secondary" type="button" disabled={refrescando} onClick={actualizarVista}>{refrescando ? "Actualizando…" : "Actualizar lista"}</button>
        </div>
      </section>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="card stack min-w-0" aria-label="Lista de MJRV">
          <p role="status">{visibles.length} {visibles.length === 1 ? "ficha" : "fichas"}</p>
          {!visibles.length ? <p>No hay fichas con estos filtros.</p> : (
            <ul className="max-h-[65vh] divide-y overflow-y-auto">
              {visibles.map((f) => (
                <li key={f.id}>
                  <button type="button" aria-pressed={seleccion?.id === f.id} onClick={() => abrir(f.id)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded px-3 py-3 text-left shadow-none aria-pressed:bg-blue-50">
                    <span className="min-w-0 break-words font-semibold">{f.nombre}<span className="block text-sm font-normal">Junta {f.junta} · {f.cedula}</span></span>
                    <span className={f.estado === "validado" ? "text-sm font-medium text-green-800" : "text-sm font-medium text-amber-900"}>{rotulo(f)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card stack min-w-0" ref={panel} tabIndex={-1} aria-label="Vista previa y captura">
          {validacion ? (
            <Documentacion key={elegida ? `${elegida.id}:${elegida.revisionEn}:${elegida.version}:${seleccion?.revision}` : "busqueda"} token={token} validarPorEnlace={!!token}
              cedulaInicial={elegida?.cedula} onDocumentoCambiado={actualizarLista}
              onTerminarFicha={elegida ? () => setSeleccion(null) : undefined} />
          ) : elegida ? (
            <DetalleDocumento key={`${elegida.id}:${seleccion?.revision}`} ficha={elegida} modo={modo} onGuardar={actualizarLista}
              siguiente={siguiente ? () => abrir(siguiente.id) : undefined} />
          ) : <p>Seleccione a un MJRV para ver sus fotos o completar la captura.</p>}
        </section>
      </div>
    </>
  );
}

function DetalleDocumento({ ficha, modo, onGuardar, siguiente }: {
  ficha: FichaDocumentosFinanzas; modo: Modo; onGuardar: () => void; siguiente?: () => void;
}) {
  const [mensaje, setMensaje] = useState("");
  const [captura, setCaptura] = useState(false);

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
      const { completos } = await respuesta.json() as EstadoDocs;
      onGuardar();
      setMensaje(completos ? "Documento completo. Puede pasar a revisión." : "Foto guardada.");
      return true;
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "No se pudo guardar la foto.");
      return false;
    }
  }

  return (
    <>
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2>{ficha.nombre}</h2>
          {siguiente && <button type="button" className="button-like secondary" onClick={siguiente}>Siguiente ficha</button>}
        </div>
        <p>Junta {ficha.junta} · {rotulo(ficha)}</p>
      </div>
      <RevisionDocumentoFinanzas key={`${ficha.version}:${ficha.revisionEn}`} id={ficha.id} modo={modo} version={ficha.version}
        fotos={ficha} estado={ficha.estado} revisionEn={ficha.revisionEn} motivoRepetir={ficha.motivoRepetir}
        onGuardar={(aviso) => { setMensaje(aviso); onGuardar(); }} />
      {mensaje && <p role="status">{mensaje}</p>}
      {ficha.estado === "necesita_repetir" && ficha.completos ? (
        <button className="button-like secondary" type="button" onClick={() => setCaptura(!captura)}>
          {captura ? "Cerrar captura" : "Volver a fotografiar el documento"}
        </button>
      ) : ficha.completos ? (
        <Link className="button-like secondary" href={{ pathname: "/admin/finanzas/pagar", query: { cedula: ficha.cedula } }}>Ir a Revisar e imprimir</Link>
      ) : null}
      {(!ficha.completos || captura) && <CapturaDocumentosPuesto fotos={ficha} onUsar={subir} seguirConReverso />}
    </>
  );
}
