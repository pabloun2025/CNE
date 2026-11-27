"use client";

import { useState, type FormEvent } from "react";
import { Documentacion } from "@/app/e/[token]/trabajo/documentacion";
import { LectorQr } from "@/components/lector-qr";
import { CARGOS, type Cargo } from "@/domain/cargos";
import type { consultarJuntaVerificacion, listarJuntasVerificacion } from "@/server/verificacion-mesas";

type Consulta = NonNullable<Awaited<ReturnType<typeof consultarJuntaVerificacion>>>;
type Junta = Awaited<ReturnType<typeof listarJuntasVerificacion>>[number];

async function solicitar<T>(datos: object, token?: string): Promise<T> {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  const r = await fetch(token ? "/api/e/mesas" : "/api/admin/verificacion-mesas", {
    method: "POST", headers, body: JSON.stringify(datos),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.mensaje ?? d.error ?? "No se pudo completar la operación.");
  return d;
}

export function VerificacionMesas({ juntas, token }: { juntas: Junta[]; token?: string }) {
  const [juntaId, setJunta] = useState(0);
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [cargo, setCargo] = useState<Cargo | "">("");
  const [cedula, setCedula] = useState("");
  const [consultada, setConsultada] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [lector, setLector] = useState(false);
  const [capturar, setCapturar] = useState("");
  const [aviso, setAviso] = useState(false);

  async function cargarJunta(id: number, texto = "") {
    setOcupado(true);
    setMensaje("");
    setAviso(false);
    if (texto) setConsultada("");
    try {
      setConsulta(id ? await solicitar<Consulta>({ accion: "consultar", juntaId: id, cedula: texto }, token) : null);
      setConsultada(texto);
    } catch (e) {
      setConsulta(null);
      setMensaje(e instanceof Error ? e.message : "No se pudo consultar la junta.");
    } finally { setOcupado(false); }
  }

  const actual = consulta?.puestos.find((p) => p.cargo === cargo);
  const persona = consulta?.persona;
  const cambiaCargo = !!persona?.actuacionCargo && persona.actuacionCargo !== cargo;
  const exigeAviso = !!actual || cambiaCargo || (!!persona && persona.juntaId !== juntaId);

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
      setConsulta(await solicitar<Consulta>({ accion: "consultar", juntaId }, token));
      setCapturar(posicion);
      setConsultada("");
      setCedula("");
      setCargo("");
      setAviso(false);
      setMensaje(mensaje);
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "No se pudo confirmar.");
    } finally { setOcupado(false); }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="card stack">
        <label>Junta
          <select value={juntaId} disabled={ocupado} onChange={(e) => {
            const id = Number(e.target.value);
            setJunta(id); setCargo(""); setCedula(""); setConsultada(""); setCapturar(""); setLector(false);
            void cargarJunta(id);
          }}>
            <option value={0}>Seleccione la junta</option>
            {juntas.map((j) => <option key={j.id} value={j.id}>{j.junta} · {j.zona}</option>)}
          </select>
        </label>
        {consulta && (
          <ul className="space-y-2">
            {CARGOS.map((c) => {
              const confirmada = consulta.puestos.find((p) => p.cargo === c);
              const titular = consulta.titulares.find((p) => p.cargo === c);
              return <li key={c} className="rounded border px-3 py-2">
                <strong className="capitalize">{c}</strong>
                <p>{confirmada ? `${confirmada.nombre} · Confirmado` : titular ? `${titular.nombre} · Titular en el padrón` : "Por confirmar"}</p>
              </li>;
            })}
          </ul>
        )}
      </section>
      {consulta && (
        <section className="card stack">
          <h2>Registrar quién ejerció el cargo</h2>
          <label>Cargo
            <select disabled={ocupado} value={cargo} onChange={(e) => { setCargo(e.target.value as Cargo | ""); setAviso(false); }}>
              <option value="">Seleccione el cargo</option>
              {CARGOS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void cargarJunta(juntaId, cedula); }}>
            <label className="min-w-0 flex-1">Número de cédula
              <input value={cedula} required inputMode="numeric" autoComplete="off" disabled={ocupado} onChange={(e) => { setCedula(e.target.value); setConsultada(""); }} />
            </label>
            <button className="button-like" disabled={ocupado || !cargo}>Buscar</button>
          </form>
          {cargo && <button type="button" className="button-like secondary" disabled={ocupado} onClick={() => setLector(!lector)}>
            {lector ? "Cerrar lector" : "Escanear QR de la credencial"}
          </button>}
          {lector && cargo && <LectorQr pausado={ocupado} onCodigo={(codigo) => { setLector(false); setCedula(codigo); void cargarJunta(juntaId, codigo); }} />}
          {consultada && cargo && (
            persona?.activo === false ? <p role="alert">La ficha está de baja. Consulte al responsable.</p> :
              <form className="stack" onSubmit={(e) => void confirmar(e)}>
                {persona ? <p><strong>{persona.nombre}</strong> · Junta actual {persona.junta}</p> : <>
                  <p>La cédula no tiene ficha. Complete los datos para incorporar a la persona.</p>
                  <label>Nombres<input name="nombres" required maxLength={120} /></label>
                  <label>Apellidos<input name="apellidos" required maxLength={120} /></label>
                </>}
                {exigeAviso && <label className="flex items-start gap-2">
                  <input type="checkbox" required checked={aviso} onChange={(e) => setAviso(e.target.checked)} />
                  <span>Confirmo el cambio de {cargo}{actual ? ` registrado para ${actual.nombre}` : ""}{cambiaCargo ? ` y el retiro del cargo anterior de ${persona?.actuacionCargo}` : ""}{persona && persona.juntaId !== juntaId ? ` y el traslado desde ${persona.junta}` : ""}.</span>
                </label>}
                <button className="button-like" disabled={ocupado || (exigeAviso && !aviso)}>Confirmar actuación</button>
              </form>
          )}
        </section>
      )}
      {mensaje && <p role="status">{mensaje} {capturar && <a href="#fotos-mesa">Ir a las fotos</a>}</p>}
      <section className="card stack" id="fotos-mesa">
        <h2>Fotografiar cédula o pasaporte</h2>
        <Documentacion key={capturar} token={token} capturaMesas cedulaInicial={capturar} />
      </section>
    </div>
  );
}
