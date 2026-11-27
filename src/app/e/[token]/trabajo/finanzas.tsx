"use client";

import { useRef, useState } from "react";
import { LectorQr } from "@/components/lector-qr";

const DESTINO = {
  revision: "Indique que pase a Revisión.",
  impresion: "Indique que pase directamente a Impresión.",
  caja: "Indique que pase a Caja.",
  pagada: "El pago de esta persona ya consta como confirmado.",
} as const;

type Ingreso = { nombre: string; etapa: keyof typeof DESTINO };

export function Finanzas({ token }: { token: string }) {
  const enCurso = useRef(false);
  const [cedula, setCedula] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ingreso, setIngreso] = useState<Ingreso | null>(null);
  const [error, setError] = useState("");

  async function enviar(codigo: string) {
    if (enCurso.current || ingreso) return;
    enCurso.current = true;
    setEnviando(true);
    setError("");
    const solicitud = new AbortController();
    const plazo = window.setTimeout(() => solicitud.abort(), 10000);
    try {
      const r = await fetch("/api/e/finanzas/escanear", {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ cedula: codigo.trim() }),
        signal: solicitud.signal,
      });
      if (r.status === 401 || r.status === 403) {
        setError("El enlace ya no está activo. Pida uno nuevo a la administración.");
      } else if (r.status === 404) {
        setError("No encontramos una ficha activa. Compruebe el QR o la cédula.");
      } else {
        const datos = (await r.json().catch(() => null)) as ({ ok?: boolean } & Partial<Ingreso>) | null;
        if (r.ok && datos?.ok && typeof datos.nombre === "string" && datos.etapa && Object.hasOwn(DESTINO, datos.etapa)) {
          setIngreso({ nombre: datos.nombre, etapa: datos.etapa });
          setCedula("");
        } else {
          setError("No se pudo remitir la ficha. Vuelva a intentarlo.");
        }
      }
    } catch {
      setError("No se pudo confirmar el ingreso a Finanzas. Revise la conexión y vuelva a intentarlo.");
    } finally {
      window.clearTimeout(plazo);
      enCurso.current = false;
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg stack">
      <h1>1. Ingreso a Finanzas</h1>
      {ingreso ? (
        <section className="card stack">
          <div role="status">
            <p className="font-semibold">{ingreso.nombre}</p>
            <p>{DESTINO[ingreso.etapa]}</p>
          </div>
          <button type="button" className="button-like" onClick={() => setIngreso(null)}>Siguiente persona</button>
        </section>
      ) : (
        <>
          <form className="card stack" onSubmit={(e) => {
            e.preventDefault();
            if (cedula.trim()) void enviar(cedula);
          }}>
            <h2>Ingresar por cédula</h2>
            <label>Número de cédula
              <input value={cedula} onChange={(e) => setCedula(e.target.value)} autoComplete="off" inputMode="numeric" maxLength={40} disabled={enviando} required />
            </label>
            <button type="submit" disabled={enviando || !cedula.trim()}>Enviar ficha</button>
          </form>
          {enviando && <p role="status">Consultando la ficha…</p>}
          {error && <p role="alert" className="font-semibold text-red-700">{error}</p>}
        </>
      )}
      <div hidden={!!ingreso}>
        <section className="stack">
          <h2>Escanear credencial</h2>
          <LectorQr encuadre abrirAlEntrar pausado={enviando || !!ingreso || !!cedula.trim()} onCodigo={(codigo) => void enviar(codigo)} />
        </section>
      </div>
    </div>
  );
}
