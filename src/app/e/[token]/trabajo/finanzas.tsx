"use client";

import { useRef, useState } from "react";
import { LectorQr } from "@/components/lector-qr";

export function Finanzas({ token }: { token: string }) {
  const enCurso = useRef(false);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState("");

  async function enviar(cedula: string) {
    if (enCurso.current || enviado) return;
    enCurso.current = true;
    setEnviando(true);
    setError("");
    try {
      const r = await fetch("/api/e/finanzas/escanear", {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ cedula }),
      });
      if (r.ok) setEnviado(true);
      else if (r.status === 401 || r.status === 403) setError("El enlace ya no está activo. Pida uno nuevo a la administración.");
      else setError("No se pudo enviar la credencial. Compruebe el QR y vuelva a escanearlo.");
    } catch {
      setError("Revise la conexión y vuelva a escanear la credencial.");
    } finally {
      enCurso.current = false;
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-3">
      <h1 className="text-xl font-bold">Escanee el QR de la credencial</h1>
      <LectorQr encuadre abrirAlEntrar pausado={enviando || enviado} onCodigo={(cedula) => void enviar(cedula)} />
      {enviando && <p role="status">Enviando a Revisión…</p>}
      {error && <p role="alert" className="font-semibold text-red-700">{error}</p>}
      {enviado && (
        <div className="space-y-2">
          <p role="status" className="font-semibold text-green-800">Credencial enviada a Revisión.</p>
          <button type="button" className="w-full bg-stone-900 px-4 py-3 text-white" onClick={() => setEnviado(false)}>Escanear otra credencial</button>
        </div>
      )}
    </div>
  );
}
