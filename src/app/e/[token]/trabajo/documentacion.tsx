"use client";

import { useState } from "react";
import { CapturaDocumentosPuesto, type EstadoFotos } from "@/components/captura-cedula";
import { LectorQr } from "@/components/lector-qr";
import type { LadoDocumento } from "@/domain/documentos";

type Ficha = EstadoFotos & {
  mjrvId: number; nombre: string; cedula: string; junta: string; completos: boolean;
  modo?: "prueba" | "eleccion"; validada?: boolean; version?: string;
};

export function Documentacion({ token, capturaMesas = false, cedulaInicial = "" }: { token?: string; capturaMesas?: boolean; cedulaInicial?: string }) {
  const autenticada = token === undefined;
  const validacion = autenticada && !capturaMesas;
  const cabeceras = token ? { authorization: `Bearer ${token}` } : new Headers();
  const [cedula, setCedula] = useState(cedulaInicial);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [repetir, setRepetir] = useState(false);
  const [fotosCargadas, setFotosCargadas] = useState<string[]>([]);
  const lados = (["anverso", "reverso", "pasaporte"] as const).filter((lado) => ficha?.[lado]);
  const fotosVisibles = ficha?.version && lados.every((lado) => fotosCargadas.includes(`${ficha.version}:${lado}`));

  async function consultar(c: string): Promise<Ficha | null> {
    const ruta = autenticada ? "/api/admin/documentacion/buscar" : "/api/e/documentacion/buscar";
    const headers = new Headers(cabeceras);
    headers.set("content-type", "application/json");
    const r = await fetch(ruta, { method: "POST", headers, body: JSON.stringify({ cedula: c }) });
    if (r.status === 401 || r.status === 403) {
      throw new Error(autenticada ? "Vuelva a iniciar sesión." : "El enlace ya no está activo. Pida uno nuevo a la administración.");
    }
    if (!r.ok) throw new Error("No se pudo consultar. Revise la conexión.");
    const d = await r.json();
    return d.encontrada ? d : null;
  }

  const buscar = async (c: string) => {
    setMensaje("");
    setFicha(null);
    setRepetir(false);
    setFotosCargadas([]);
    setOcupado(true);
    try {
      const actual = await consultar(c);
      setFicha(actual);
      if (!actual) setMensaje("No encontramos ese número.");
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : "No hay conexión.");
    } finally { setOcupado(false); }
  };

  const subir = async (lado: LadoDocumento, imagen: Blob) => {
    if (!ficha) return false;
    setMensaje("");
    setOcupado(true);
    const f = new FormData();
    f.set("lado", lado);
    f.set("mjrvId", String(ficha.mjrvId));
    f.set("imagen", imagen, `${lado}.jpg`);
    if (ficha.modo) f.set("modo", ficha.modo);
    try {
      const ruta = autenticada ? "/api/admin/finanzas/foto" : "/api/e/documentacion/foto";
      const r = await fetch(ruta, { method: "POST", headers: cabeceras, body: f });
      const d = await r.json();
      if (!r.ok) { setMensaje(d.error ?? "No se pudo guardar."); return false; }
      if (autenticada) {
        setFicha({ ...ficha, anverso: d.anverso, reverso: d.reverso, pasaporte: d.pasaporte, completos: d.completos, version: undefined, validada: false });
        try { setFicha(await consultar(ficha.cedula)); }
        catch { setMensaje("La foto se guardó. Vuelva a buscar la ficha para validar."); }
      } else {
        setFicha({ ...ficha, anverso: d.anverso, reverso: d.reverso, pasaporte: d.pasaporte, completos: d.completos });
      }
      return true;
    } catch { setMensaje("No hay conexión."); return false; } finally { setOcupado(false); }
  };

  const validar = async () => {
    if (!ficha?.version || !fotosVisibles) return;
    setMensaje("");
    setOcupado(true);
    try {
      const { mjrvId, modo, version } = ficha;
      const r = await fetch("/api/admin/finanzas/validar-cedula", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mjrvId, modo, version }),
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setMensaje(d.mensaje ?? d.error ?? "No se pudo validar.");
        return;
      }
      setFicha({ ...ficha, validada: true });
      setRepetir(false);
    } catch { setMensaje("No se pudo confirmar la validación. Vuelva a buscar la ficha."); }
    finally { setOcupado(false); }
  };

  return (
    <div className="mx-auto max-w-md space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); void buscar(cedula); }} className="flex gap-2">
        <input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Número de cédula" aria-label="Número de cédula" autoComplete="off" required disabled={ocupado} className="min-w-0 flex-1" />
        <button disabled={ocupado} className="bg-stone-900 px-4 text-white disabled:opacity-60">Buscar</button>
      </form>
      {!ficha && <LectorQr pausado={ocupado} onCodigo={(c) => { setCedula(c); void buscar(c); }} />}
      {mensaje && <p role="alert" className="font-semibold text-red-700">{mensaje}</p>}
      {ficha && (
        <section className="space-y-3 border-2 border-stone-900 p-3">
          <p className="text-xl font-bold">{ficha.nombre}</p>
          <p>{ficha.cedula} · junta {ficha.junta}</p>
          <p role="status" className={`font-bold ${ficha.completos ? "text-green-800" : "text-amber-800"}`}>
            {ficha.pasaporte ? "Página de datos del pasaporte guardada" : ficha.completos ? "Anverso y reverso de la cédula guardados" : ficha.anverso ? "Falta el reverso de la cédula" : ficha.reverso ? "Falta el anverso de la cédula" : "Sin fotos del documento"}
          </p>
          {validacion && ficha.version && lados.map((lado) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${ficha.version}:${lado}`} src={`/api/admin/finanzas/cedula/${ficha.mjrvId}/${lado}?modo=${ficha.modo}&version=${ficha.version}`}
              onLoad={() => setFotosCargadas((actual) => [...actual, `${ficha.version}:${lado}`])}
              onError={() => setMensaje("No se pudo abrir una foto. Vuelva a buscar la ficha o repita la captura.")}
              alt={lado === "pasaporte" ? "Página de datos del pasaporte" : `Cédula · ${lado}`} className="w-full rounded border object-contain" />
          ))}
          {validacion && ficha.completos && (
            <button type="button" className="button-like secondary" disabled={ocupado} onClick={() => setRepetir(!repetir)}>
              {repetir ? "Cerrar captura" : "Volver a fotografiar el documento"}
            </button>
          )}
          {(!validacion || !ficha.completos || repetir) && <CapturaDocumentosPuesto key={ficha.mjrvId} fotos={ficha} onUsar={subir} />}
          {validacion && ficha.completos && !repetir && (
            ficha.validada
              ? (fotosVisibles && <p role="status" className="font-bold text-green-800">Documento validado</p>)
              : <button type="button" className="button-like w-full" disabled={ocupado || !fotosVisibles} onClick={() => void validar()}>Validar documento</button>
          )}
          <button disabled={ocupado} onClick={() => { setFicha(null); setCedula(""); setMensaje(""); setRepetir(false); }} className="border-2 border-stone-900 px-4 py-3 disabled:opacity-60">Otra persona</button>
        </section>
      )}
    </div>
  );
}
