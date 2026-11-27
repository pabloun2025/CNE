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
import { useSondeo } from "./sondeo";

const FILTROS = [
  { id: "en_ventanilla", etiqueta: "En ventanilla" },
  { id: "por_validar", etiqueta: "Por validar" },
  { id: "necesita_repetir", etiqueta: "Necesita repetir" },
  { id: "validado", etiqueta: "Validados" },
  { id: "pendientes", etiqueta: "Pendientes de captura" },
  { id: "del_mjrv", etiqueta: "Del MJRV sin validar" },
  { id: "completos", etiqueta: "Fotos completas" },
  { id: "todos", etiqueta: "Todos" },
] as const;
type Filtro = typeof FILTROS[number]["id"];
type ColaRevision = { modo: Modo; escaneados: { mjrvId: number; escaneadoEn: string }[] };
type EntradaVentanilla = ReturnType<typeof useSondeo<ColaRevision>>;

const normalizar = (texto: string) => texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es");
function coincide(ficha: FichaDocumentosFinanzas, filtro: Filtro, turno: Map<number, string>) {
  if (filtro === "en_ventanilla") return turno.has(ficha.id);
  if (filtro === "todos") return true;
  if (filtro === "pendientes") return !ficha.completos;
  if (filtro === "completos") return ficha.completos;
  if (filtro === "del_mjrv") return ficha.estado !== "validado" && (ficha.origen === "mjrv" || ficha.origen === "mixto");
  return ficha.estado === filtro;
}

function rotulo(ficha: FichaDocumentosFinanzas) {
  return [ESTADOS_DOCUMENTO[ficha.estado], ficha.origen ? ORIGEN_DOCUMENTOS[ficha.origen] : ""].filter(Boolean).join(" · ");
}

export function RevisionVentanilla(props: { fichas: FichaDocumentosFinanzas[]; modo: Modo; cedulaInicial?: string }) {
  const ventanilla = useSondeo<ColaRevision>("/api/admin/finanzas/escaneados?etapa=revision", 5000);
  return <SeguimientoDocumental {...props} ventanilla={ventanilla} />;
}

export function SeguimientoDocumental({ fichas, modo, validacion = false, token, ventanilla, cedulaInicial }: {
  fichas: FichaDocumentosFinanzas[]; modo: Modo; validacion?: boolean; token?: string;
  ventanilla?: EntradaVentanilla; cedulaInicial?: string;
}) {
  const router = useRouter();
  const [refrescando, refrescar] = useTransition();
  const [filtro, setFiltro] = useState<Filtro>(ventanilla ? "en_ventanilla" : "por_validar");
  const [busqueda, setBusqueda] = useState("");
  const [junta, setJunta] = useState("");
  const [seleccion, setSeleccion] = useState<{ id: number; revision: number } | null>(() => {
    const ficha = fichas.find((f) => f.cedula === cedulaInicial);
    return ficha ? { id: ficha.id, revision: 0 } : null;
  });
  const panel = useRef<HTMLElement>(null);
  const juntas = [...new Set(fichas.map((f) => f.junta))];
  const terminos = normalizar(busqueda.trim()).split(/\s+/).filter(Boolean);
  const coincidentes = fichas.filter((f) =>
    (!junta || junta === f.junta) && terminos.every((parte) => normalizar(`${f.nombre} ${f.cedula}`).includes(parte)));
  const escaneados = ventanilla?.datos?.modo === modo ? ventanilla.datos.escaneados : [];
  const turno = new Map(escaneados.map((f) => [f.mjrvId, f.escaneadoEn]));
  const visibles = coincidentes.filter((f) => coincide(f, filtro, turno));
  if (filtro === "en_ventanilla") visibles.sort((a, b) => turno.get(a.id)!.localeCompare(turno.get(b.id)!));
  const elegida = fichas.find((f) => f.id === seleccion?.id);
  const posicion = visibles.findIndex((f) => f.id === elegida?.id);
  const siguiente = visibles[posicion + 1] ?? visibles.find((f) => f.id !== elegida?.id);

  function actualizarLista() {
    refrescar(() => router.refresh());
    ventanilla?.refrescar();
  }

  function actualizarVista() {
    setSeleccion((actual) => actual && { ...actual, revision: actual.revision + 1 });
    actualizarLista();
  }

  function abrir(id: number) {
    setSeleccion((actual) => ({ id, revision: (actual?.revision ?? 0) + 1 }));
    if (ventanilla) refrescar(() => router.refresh());
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => panel.current?.focus());
    }
  }

  const botones = FILTROS.filter(({ id }) => id !== "en_ventanilla" || ventanilla);
  const principal = ({ id }: { id: Filtro }) =>
    id === "en_ventanilla" || id === "por_validar" || id === "necesita_repetir" || id === "validado";
  const mostrarFiltro = ({ id, etiqueta }: typeof FILTROS[number]) => (
    <button key={id} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(id)}
      className={filtro === id ? "button-like" : "button-like secondary"}>
      {etiqueta} ({coincidentes.filter((f) => coincide(f, id, turno)).length})
    </button>
  );

  return (
    <>
      <section className="card stack" aria-label="Filtrar documentos">
        <div className="flex flex-wrap gap-2">{botones.filter(principal).map(mostrarFiltro)}</div>
        <details>
          <summary className="cursor-pointer font-semibold text-[var(--blue)]">Más filtros</summary>
          <div className="mt-2 flex flex-wrap gap-2">{botones.filter((opcion) => !principal(opcion)).map(mostrarFiltro)}</div>
        </details>
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
          {filtro === "en_ventanilla" && !ventanilla?.datos && <p role="status">{ventanilla?.falla ? "No se pudo cargar la cola. Pulse Actualizar lista." : "Cargando la cola de ventanilla…"}</p>}
          <p role="status">{visibles.length} {visibles.length === 1 ? "ficha" : "fichas"}</p>
          {!visibles.length ? (filtro !== "en_ventanilla" || ventanilla?.datos) &&
            <p>{filtro === "en_ventanilla" ? "No hay personas por revisar en ventanilla." : "No hay fichas con estos filtros."}</p> : (
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
        fotos={ficha} estado={ficha.estado} revisionEn={ficha.revisionEn} motivoRepetir={ficha.motivoRepetir} soloLectura={ficha.pagoConfirmado}
        onGuardar={(aviso) => { setMensaje(aviso); onGuardar(); }} />
      {mensaje && <p role="status">{mensaje}</p>}
      {ficha.pagoConfirmado ? <p>Pago confirmado.</p> : ficha.estado === "necesita_repetir" && ficha.completos ? (
        <button className="button-like secondary" type="button" onClick={() => setCaptura(!captura)}>
          {captura ? "Cerrar captura" : "Volver a fotografiar el documento"}
        </button>
      ) : ficha.estado === "validado" ? (
        <Link className="button-like secondary" href={{ pathname: "/admin/finanzas/pagar", query: { cedula: ficha.cedula } }}>Ir a Impresión</Link>
      ) : null}
      {!ficha.pagoConfirmado && (!ficha.completos || captura) && <CapturaDocumentosPuesto fotos={ficha} onUsar={subir} seguirConReverso />}
    </>
  );
}
