"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Documentacion } from "@/app/e/[token]/trabajo/documentacion";
import { LectorQr } from "@/components/lector-qr";
import { CARGOS, type Cargo } from "@/domain/cargos";
import { ESTADOS_DOCUMENTO, ORIGEN_DOCUMENTOS } from "@/domain/documentos";
import { ZONA_HEX, ZONA_NOMBRE } from "@/domain/juntas";
import { PanoramaJuntas, type FiltroDocumentosMesa } from "./panorama-juntas";
import type { consultarJuntaVerificacion, DocumentoEnMesa, JuntaPanorama } from "@/server/verificacion-mesas";

type Consulta = NonNullable<Awaited<ReturnType<typeof consultarJuntaVerificacion>>>;
type Accion = "buscar" | "anadir" | "ausencia";
const NOMBRES_CARGO: Record<Cargo, string> = { presidente: "Presidencia", secretario: "Secretaría", vocal: "Vocalía" };
const CLASE_VISTA = "min-h-11 rounded-lg px-1 text-sm font-semibold text-[var(--navy)] aria-pressed:bg-white aria-pressed:shadow-sm";
const CLASE_ACCION = "min-h-11 text-sm font-semibold text-[var(--blue)]";

async function solicitar<T>(datos: object, token?: string, signal?: AbortSignal): Promise<T> {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  const r = await fetch(token ? "/api/e/mesas" : "/api/admin/verificacion-mesas", {
    method: "POST", headers, body: JSON.stringify(datos), signal,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.mensaje ?? d.error ?? "No se pudo completar la operación.");
  return d;
}

export function VerificacionMesas({ juntas, token }: { juntas: JuntaPanorama[]; token?: string }) {
  const [juntaId, setJunta] = useState(0);
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [vista, setVista] = useState<"personal" | "documentos">("personal");
  const [filtroDocumental, setFiltroDocumental] = useState<FiltroDocumentosMesa>("todos");
  const [accion, setAccion] = useState<Accion>("buscar");
  const [cargo, setCargo] = useState<Cargo | "">("");
  const [cedula, setCedula] = useState("");
  const [consultada, setConsultada] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [personaConfirmada, setPersonaConfirmada] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [lector, setLector] = useState(false);
  const [aviso, setAviso] = useState(false);
  const [capturar, setCapturar] = useState({ cedula: "", revision: 0 });
  const [refresco, setRefresco] = useState(0);
  const [fallaDocumentos, setFallaDocumentos] = useState(false);
  const posicionRecorrido = useRef(0);
  const refrescarDocumentos = () => setRefresco((n) => n + 1);
  function abrirFotos(cedula: string) {
    setCapturar((actual) => ({ cedula, revision: actual.revision + 1 }));
    setVista("documentos");
    requestAnimationFrame(() => document.getElementById("fotos-mesa")?.scrollIntoView({ block: "start" }));
  }
  const modoConsulta = consulta?.modo;
  const editando = Boolean(cargo);
  const cargarPanorama = useCallback((signal: AbortSignal) =>
    solicitar<JuntaPanorama[]>({ accion: "panorama" }, token, signal), [token]);

  useEffect(() => {
    if (!juntaId || !modoConsulta) return;
    const controlador = new AbortController();
    let enCurso = false;
    async function actualizar() {
      if (enCurso || document.visibilityState === "hidden") return;
      enCurso = true;
      try {
        const datos = await solicitar<Consulta>({ accion: "consultar", juntaId }, token, controlador.signal);
        if (!controlador.signal.aborted) {
          if (modoConsulta === datos.modo) {
            setConsulta((actual) => actual?.modo === datos.modo ? {
              ...actual, documentacion: datos.documentacion, actuantes: datos.actuantes,
              puestos: editando ? actual.puestos : datos.puestos, titulares: editando ? actual.titulares : datos.titulares,
            } : actual);
          } else {
            setConsulta(datos);
            setCedula(""); setConsultada(""); setCargo(""); setAviso(false); setLector(false);
            setCapturar({ cedula: "", revision: 0 });
            setPersonaConfirmada("");
            setMensaje("El modo cambió. Consulte la ficha antes de confirmar.");
          }
          setFallaDocumentos(false);
        }
      } catch { if (!controlador.signal.aborted) setFallaDocumentos(true); }
      finally { enCurso = false; }
    }
    if (refresco) void actualizar();
    const intervalo = window.setInterval(actualizar, 15000);
    return () => { controlador.abort(); window.clearInterval(intervalo); };
  }, [juntaId, token, refresco, modoConsulta, editando]);

  async function cargarJunta(id: number, texto = "") {
    setOcupado(true);
    setMensaje("");
    setAviso(false);
    if (texto) setConsultada("");
    try {
      setConsulta(id ? await solicitar<Consulta>({ accion: "consultar", juntaId: id, cedula: texto }, token) : null);
      setConsultada(texto);
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "No se pudo consultar la junta.");
    } finally { setOcupado(false); }
  }

  function elegirJunta(id: number, documentos?: FiltroDocumentosMesa) {
    if (id && !juntaId) posicionRecorrido.current = window.scrollY;
    setJunta(id); setConsulta(null); setCargo(""); setCedula(""); setConsultada("");
    setVista(documentos ? "documentos" : "personal"); setFiltroDocumental(documentos ?? "todos");
    setCapturar({ cedula: "", revision: 0 }); setPersonaConfirmada(""); setFallaDocumentos(false); setLector(false);
    void cargarJunta(id);
    requestAnimationFrame(() => window.scrollTo(0, id ? 0 : posicionRecorrido.current));
  }

  function elegirCargo(valor: Cargo | "", opcion: Accion = "buscar") {
    setCargo(valor); setAccion(opcion); setCedula(""); setConsultada(""); setAviso(false); setLector(false); setMensaje(""); setPersonaConfirmada("");
  }

  const junta = juntas.find((j) => j.id === juntaId);
  const actual = consulta?.puestos.find((p) => p.cargo === cargo);
  const persona = consultada ? consulta?.persona : null;
  const cargoAnterior = persona?.actuacionCargo;
  const retiraCargo = cargoAnterior && cargoAnterior !== cargo ? NOMBRES_CARGO[cargoAnterior] : "";
  const exigeAviso = !!actual || !!retiraCargo || (!!persona && persona.juntaId !== juntaId);

  async function actualizarTrasGuardar(mensaje: string) {
    setMensaje(mensaje);
    try {
      setConsulta(await solicitar<Consulta>({ accion: "consultar", juntaId }, token));
    } catch {
      setConsulta(null);
      setMensaje(`${mensaje} Pulse Reintentar para actualizar la ficha.`);
    }
  }

  async function confirmar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!consulta || !cargo || !consultada || ocupado || (exigeAviso && !aviso)) return;
    const datos = new FormData(e.currentTarget);
    setOcupado(true);
    setMensaje("");
    try {
      const posicion = persona?.cedula ?? consultada;
      const { mensaje } = await solicitar<{ mensaje: string }>({
        accion: "confirmar", juntaId, cedula: posicion, cargo, modo: consulta.modo,
        personaAnterior: persona ? { id: persona.id, juntaId: persona.juntaId, actuacionId: persona.actuacionId } : null,
        nombres: datos.get("nombres"), apellidos: datos.get("apellidos"), verificacionAnterior: actual?.id ?? null,
      }, token);
      elegirCargo("");
      setPersonaConfirmada(posicion);
      await actualizarTrasGuardar(mensaje);
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "No se pudo confirmar.");
    } finally { setOcupado(false); }
  }

  async function cambiarAusencia(titular: Consulta["titulares"][number]) {
    if (!consulta || ocupado) return;
    setOcupado(true);
    setMensaje("");
    try {
      const { mensaje } = await solicitar<{ mensaje: string }>({
        accion: "ausencia", juntaId, cargo: titular.cargo, titularId: titular.id, ausente: !titular.ausente, modo: consulta.modo,
      }, token);
      elegirCargo("");
      await actualizarTrasGuardar(mensaje);
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "No se pudo registrar la ausencia.");
    } finally { setOcupado(false); }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <PanoramaJuntas inicial={juntas} activo={!juntaId} cargar={cargarPanorama} abrir={elegirJunta} />
      {junta && (
        <section className="card grid gap-3 !p-3.5">
          <button type="button" className="min-h-11 justify-self-start text-sm font-semibold text-[var(--blue)]"
            disabled={ocupado} onClick={() => elegirJunta(0)}>← <span>Volver al recorrido</span></button>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2>Junta {junta.junta}</h2>
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <span className="size-3 rounded-full border border-black/20" style={{ backgroundColor: ZONA_HEX[junta.zona] }} aria-hidden="true" />
              {ZONA_NOMBRE[junta.zona]}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--blue-wash)] p-1" role="group" aria-label="Vista de la junta">
            <button type="button" aria-pressed={vista === "personal"} disabled={ocupado}
              className={CLASE_VISTA} onClick={() => { elegirCargo(""); setVista("personal"); }}>Personal</button>
            <button type="button" aria-pressed={vista === "documentos"} disabled={ocupado}
              className={CLASE_VISTA} onClick={() => { elegirCargo(""); setVista("documentos"); }}>Documentos</button>
          </div>
        </section>
      )}
      {junta && ocupado && !consulta && <p role="status" className="empty">Cargando junta…</p>}
      {mensaje && (
        <div role="status" className="banner flex flex-wrap items-center justify-between gap-2">
          <p>{mensaje}</p>
          {personaConfirmada && consulta && vista === "personal" && <button type="button" className="button-like secondary" disabled={ocupado}
            onClick={() => abrirFotos(personaConfirmada)}>Abrir fotos</button>}
          {junta && !consulta && <button type="button" className="button-like secondary" disabled={ocupado} onClick={() => void cargarJunta(juntaId)}>Reintentar</button>}
        </div>
      )}
      {consulta && vista === "personal" && (
        <ul className="grid gap-2.5">
          {CARGOS.map((c) => {
            const puesto = consulta.puestos.find((p) => p.cargo === c);
            const titular = consulta.titulares.find((p) => p.cargo === c);
            const permiteAusencia = !!titular && (titular.ausente || !consulta.actuantes.includes(titular.id));
            const principal = puesto ? "Cambiar MJRV" : titular?.ausente ? "Buscar reemplazo" : titular ? "Confirmar o cambiar" : "Buscar MJRV";
            const editandoCargo = cargo === c;
            return (
              <li key={c} className="card grid gap-2 !p-3.5" aria-label={NOMBRES_CARGO[c]}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3>{NOMBRES_CARGO[c]}</h3>
                  <span className={puesto ? "rounded-full px-2 py-0.5 text-xs font-semibold bg-[var(--ok-soft)] text-[var(--ok)]"
                    : titular?.ausente ? "rounded-full px-2 py-0.5 text-xs font-semibold bg-[var(--red-soft)] text-[var(--bad)]" : "rounded-full px-2 py-0.5 text-xs font-semibold bg-[var(--gold-soft)] text-[var(--gold-ink)]"}>
                    {puesto ? "Confirmado" : titular?.ausente ? "Falta reemplazo" : "Pendiente"}
                  </span>
                </div>
                <p className="text-sm font-semibold">{puesto?.nombre ?? titular?.nombre ?? "Sin titular en el padrón"}</p>
                {titular?.ausente && <p className="text-sm text-[var(--bad)]">{puesto ? `Titular ausente · ${titular.nombre}` : "Titular ausente"}</p>}
                {editandoCargo ? (
                  <section className="grid gap-2.5 border-t border-[var(--line)] pt-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-semibold text-[var(--navy)]">
                        {accion === "anadir" ? "Añadir MJRV" : accion === "ausencia" ? titular?.ausente ? "Deshacer ausencia" : "Marcar ausencia" : principal}
                      </h4>
                      <button type="button" className="min-h-11 text-sm font-semibold text-[var(--blue)]" disabled={ocupado} onClick={() => elegirCargo("")}>Cancelar</button>
                    </div>
                    {accion === "ausencia" && titular ? (
                      <>
                        <p className="text-sm">{titular.ausente ? "Se retirará la marca de ausencia del titular." : `¿Confirma que ${titular.nombre} está ausente?`}</p>
                        <button type="button" className="button-like" disabled={ocupado} onClick={() => void cambiarAusencia(titular)}>
                          {titular.ausente ? "Retirar ausencia" : "Confirmar ausencia"}
                        </button>
                      </>
                    ) : (
                      <>
                        {accion === "anadir" && <p className="text-sm text-[var(--text-2)]">Busque su cédula. Si aún no tiene ficha, podrá añadir su nombre.</p>}
                        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void cargarJunta(juntaId, cedula); }}>
                          <label className="field min-w-0 flex-1">Cédula de quien ejerció
                            <input value={cedula} required inputMode="numeric" autoComplete="off" disabled={ocupado}
                              onChange={(e) => { setCedula(e.target.value); setConsultada(""); }} />
                          </label>
                          <button className="button-like" disabled={ocupado}>Buscar</button>
                        </form>
                        <button type="button" className="button-like secondary" disabled={ocupado} onClick={() => setLector(!lector)}>
                          {lector ? "Cerrar lector" : "Escanear QR de credencial"}
                        </button>
                        {lector && <LectorQr encuadre pausado={ocupado} onCodigo={(codigo) => { setLector(false); setCedula(codigo); void cargarJunta(juntaId, codigo); }} />}
                        {consultada && (
                          persona?.activo === false ? <p role="alert" className="text-[var(--bad)]">La ficha está de baja. Consulte al responsable.</p> :
                            <form className="grid gap-2.5 rounded-lg bg-[var(--blue-wash)] p-2.5" onSubmit={(e) => void confirmar(e)}>
                              {persona ? <p><strong>{persona.nombre}</strong><br /><span className="text-sm">Junta actual {persona.junta}</span></p> : <>
                                <p className="text-sm font-semibold">Sin ficha. Complete los datos para añadir a la persona.</p>
                                <label className="field">Nombres<input name="nombres" required maxLength={120} /></label>
                                <label className="field">Apellidos<input name="apellidos" required maxLength={120} /></label>
                              </>}
                              {exigeAviso && <label className="flex items-start gap-2 text-sm">
                                <input type="checkbox" required checked={aviso} onChange={(e) => setAviso(e.target.checked)} />
                                <span>Confirmo {actual ? `el cambio de ${actual.nombre}` : "la asignación"}{retiraCargo ? ` y el retiro de ${retiraCargo}` : ""}{persona && persona.juntaId !== juntaId ? ` y el traslado desde ${persona.junta}` : ""}.</span>
                              </label>}
                              <button className="button-like" disabled={ocupado || (exigeAviso && !aviso)}>
                                {persona ? "Confirmar actuación" : "Añadir y confirmar"}
                              </button>
                            </form>
                        )}
                      </>
                    )}
                  </section>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <button type="button" className="button-like" disabled={ocupado} onClick={() => elegirCargo(c)}>{principal}</button>
                    <button type="button" className={CLASE_ACCION} disabled={ocupado} onClick={() => elegirCargo(c, "anadir")}>Añadir MJRV</button>
                    {permiteAusencia && (
                      <button type="button" className={CLASE_ACCION + " !text-[var(--bad)]"} disabled={ocupado}
                        onClick={() => elegirCargo(c, "ausencia")}>{titular.ausente ? "Deshacer ausencia" : "Marcar ausencia"}</button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {consulta && vista === "documentos" && (
        <>
          <DocumentosMesa key={juntaId} fichas={consulta.documentacion} actuantes={consulta.actuantes}
            ausentes={consulta.titulares.filter((t) => t.ausente).map((t) => t.id)} filtro={filtroDocumental}
            filtrar={setFiltroDocumental} abrir={abrirFotos} actualizar={refrescarDocumentos} falla={fallaDocumentos} />
          {capturar.revision > 0 && (
            <section className="card stack scroll-mt-24" id="fotos-mesa">
              <h2>Cédula o pasaporte</h2>
              <Documentacion key={`${juntaId}:${capturar.revision}`} token={token} capturaMesas cedulaInicial={capturar.cedula}
                juntaId={juntaId} onDocumentoCambiado={refrescarDocumentos} />
            </section>
          )}
        </>
      )}
    </div>
  );
}


const FILTROS_DOCUMENTO = {
  todos: "Todos",
  captura: "Pendientes de captura",
  mjrv: "Del MJRV sin validar",
  por_validar: "Por validar",
  validado: "Validados",
} as const;



function coincide(ficha: DocumentoEnMesa, filtro: FiltroDocumentosMesa) {
  if (filtro === "todos") return true;
  if (filtro === "captura") return ficha.estado === "sin_documento" || ficha.estado === "incompleto";
  if (filtro === "mjrv") return ficha.estado !== "validado" && (ficha.origen === "mjrv" || ficha.origen === "mixto");
  return ficha.estado === filtro;
}

function DocumentosMesa({ fichas, actuantes, ausentes, filtro, filtrar, abrir, actualizar, falla }: {
  fichas: DocumentoEnMesa[]; actuantes: number[]; ausentes: number[]; filtro: FiltroDocumentosMesa;
  filtrar: (opcion: FiltroDocumentosMesa) => void; abrir: (cedula: string) => void; actualizar: () => void; falla: boolean;
}) {
  const [todas, setTodas] = useState(false);
  const tresConfirmados = actuantes.length === CARGOS.length;
  const lista = todas ? fichas : fichas.filter((ficha) =>
    actuantes.includes(ficha.id) || (!tresConfirmados && !ausentes.includes(ficha.id)));
  const visibles = lista.filter((ficha) => coincide(ficha, filtro));
  return (
    <section className="card stack">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>Documentos de la junta</h2>
        <button type="button" className="button-like secondary" onClick={() => abrir("")}>Buscar o escanear</button>
      </div>
      {falla && <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status">Se muestran los últimos datos disponibles.</p>
        <button type="button" className="button-like secondary" onClick={actualizar}>Actualizar lista</button>
      </div>}
      <label>Estado del documento
        <select value={filtro} onChange={(e) => filtrar(e.target.value as FiltroDocumentosMesa)}>
          {(Object.keys(FILTROS_DOCUMENTO) as FiltroDocumentosMesa[]).map((opcion) => (
            <option key={opcion} value={opcion}>{FILTROS_DOCUMENTO[opcion]} ({lista.filter((ficha) => coincide(ficha, opcion)).length})</option>
          ))}
        </select>
      </label>
      {(tresConfirmados || ausentes.length > 0) && <label className="flex items-center gap-2">
        <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} /> Mostrar todas las fichas de la junta
      </label>}
      {visibles.length === 0 ? <p>No hay fichas en esta vista.</p> : (
        <ul className="divide-y">
          {visibles.map((ficha) => (
            <li key={ficha.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 py-2">
              <div className="min-w-0">
                <p className="font-semibold">{ficha.nombre}</p>
                <p className="text-sm">{ESTADOS_DOCUMENTO[ficha.estado]}{ficha.origen && ` · ${ORIGEN_DOCUMENTOS[ficha.origen]}`}</p>
              </div>
              <button type="button" className="button-like secondary" aria-label={`Abrir documento de ${ficha.nombre}`} onClick={() => abrir(ficha.cedula)}>
                Abrir documento
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
