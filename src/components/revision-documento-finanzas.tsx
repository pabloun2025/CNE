"use client";

import { useState } from "react";
import type { EstadoDocs, EstadoSeguimientoDocumento, LadoDocumento } from "@/domain/documentos";
import type { Modo } from "@/server/config";
import { desvalidarCedulaAccion, validarCedulaAccion } from "@/server/finanzas-nombres-actions";

const FOTOS = [
  { lado: "anverso", texto: "Cédula · Anverso" },
  { lado: "reverso", texto: "Cédula · Reverso" },
  { lado: "pasaporte", texto: "Pasaporte · Página de datos" },
] as const;

export function RevisionDocumentoFinanzas({ id, modo, version, fotos, estado, revisionEn, motivoRepetir, soloLectura = false, iniciarDeshacer = false, onGuardar }: {
  id: number; modo: Modo; version: string; fotos: EstadoDocs; estado: EstadoSeguimientoDocumento;
  revisionEn: string | null; motivoRepetir?: string | null; soloLectura?: boolean; iniciarDeshacer?: boolean; onGuardar: (mensaje: string) => void;
}) {
  const [cargadas, setCargadas] = useState<LadoDocumento[]>([]);
  const [ampliada, setAmpliada] = useState<LadoDocumento | null>(null);
  const [errorFoto, setErrorFoto] = useState(false);
  const [accion, setAccion] = useState<"repetir" | "deshacer" | null>(iniciarDeshacer ? "deshacer" : null);
  const [motivo, setMotivo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const lados = FOTOS.filter(({ lado }) => fotos[lado]);
  const listas = !errorFoto && lados.length > 0 && lados.every(({ lado }) => cargadas.includes(lado));
  const validado = estado === "validado";
  const repetir = estado === "necesita_repetir";

  async function guardar(cambio: "validar" | "repetir" | "deshacer") {
    const datos = new FormData();
    datos.set("id", String(id)); datos.set("modo", modo); datos.set("version", version);
    if (revisionEn) datos.set("revisionEn", revisionEn);
    if (cambio === "repetir" || repetir) datos.set("repetir", "si");
    if (cambio === "repetir") datos.set("motivo", motivo);
    setOcupado(true);
    setMensaje("");
    try {
      const resultado = await (cambio === "deshacer" ? desvalidarCedulaAccion(datos) : validarCedulaAccion(datos));
      if (!resultado.ok) { setMensaje(resultado.mensaje ?? "No se pudo guardar la revisión."); return; }
      setGuardado(true);
      setAccion(null);
      onGuardar(cambio === "validar" ? "Documento validado." : cambio === "repetir" ? "Documento marcado como «Necesita repetir»." : repetir ? "Marca de repetición retirada." : "Validación deshecha.");
    } catch {
      setMensaje("No se pudo confirmar el cambio. Actualice la lista antes de reintentar.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      {lados.length > 0 && (
        <div className={ampliada ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"}>
          {lados.map(({ lado, texto }) => (
            <figure key={lado} hidden={ampliada !== null && ampliada !== lado} className={lados.length === 1 ? "sm:col-span-2" : ""}>
              <button type="button" className="block w-full rounded border border-slate-200 p-0 shadow-none"
                aria-label={`${ampliada === lado ? "Reducir" : "Ampliar"} ${texto}`} aria-pressed={ampliada === lado}
                onClick={() => setAmpliada(ampliada === lado ? null : lado)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/admin/finanzas/cedula/${id}/${lado}?modo=${modo}&version=${version}`} alt={texto}
                  onLoad={() => setCargadas((actual) => actual.includes(lado) ? actual : [...actual, lado])}
                  onError={() => setErrorFoto(true)}
                  className={`w-full rounded bg-slate-50 object-contain ${ampliada === lado ? "max-h-none" : "max-h-64"}`} />
              </button>
              <figcaption className="text-sm">{texto}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {errorFoto && <p role="alert">No se pudo abrir una foto. Vuelva a abrir la vista previa para cargar la versión vigente.</p>}
      {repetir && motivoRepetir && <p className="banner warn">{motivoRepetir}</p>}
      {mensaje && <p role="alert" className="text-sm text-red-800">{mensaje}</p>}
      {!soloLectura && !guardado && (
        accion ? (
          <form className="banner stack" onSubmit={(e) => { e.preventDefault(); void guardar(accion); }}>
            {accion === "repetir" ? (
              <>
                {validado && <p>El documento pasará de «Validado» a «Necesita repetir».</p>}
                <label className="field">Motivo (opcional)
                  <input value={motivo} maxLength={160} placeholder="Por ejemplo, fotos borrosas" onChange={(e) => setMotivo(e.target.value)} />
                </label>
              </>
            ) : <p>{repetir ? "El documento volverá a la lista de revisión." : "Se conservarán las fotos. El documento volverá a quedar por validar."}</p>}
            <div className="flex flex-wrap gap-2">
              <button className="button-like" disabled={ocupado}>{accion === "repetir" ? "Confirmar que necesita repetir" : "Confirmar"}</button>
              <button className="button-like secondary" type="button" disabled={ocupado} onClick={() => { setAccion(null); setMensaje(""); }}>Cancelar</button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            {estado === "por_validar" && <button className="button-like" type="button" disabled={ocupado || !listas} onClick={() => void guardar("validar")}>Marcar como validado</button>}
            {!repetir && lados.length > 0 && <button className="button-like secondary" type="button" disabled={ocupado || !listas} onClick={() => setAccion("repetir")}>Necesita repetir</button>}
            {revisionEn && (validado || repetir) && <button className="button-like secondary" type="button" disabled={ocupado} onClick={() => setAccion("deshacer")}>
              {repetir ? "Deshacer marca" : "Deshacer validación"}
            </button>}
          </div>
        )
      )}
    </>
  );
}
