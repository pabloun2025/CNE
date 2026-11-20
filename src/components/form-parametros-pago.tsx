"use client";

import { useActionState } from "react";
import type { ParametrosPago } from "@/domain/pago";
import { guardarParametrosAccion, type EstadoPago } from "@/server/pago-actions";

const campo = "mt-1 block w-full";

// Todos los campos nacen vacíos: la interfaz no propone ningún valor (P-7).
export function FormParametrosPago({ valores }: { valores: ParametrosPago }) {
  const [e, enviar, p] = useActionState<EstadoPago, FormData>(guardarParametrosAccion, null);
  return (
    <form action={enviar} className="grid max-w-xl gap-3">
      <label className="block text-base font-bold">Nombre del funcionario que firma los recibos<input name="pagador_nombre" defaultValue={valores.pagador_nombre ?? ""} className={campo} /></label>
      <label className="block text-base font-bold">Valor de referencia en USD (opcional)<input name="importe_usd" inputMode="decimal" maxLength={13} defaultValue={valores.importe_usd ?? ""} className={`${campo} cifra`} /></label>
      <label className="block text-base font-bold">Importe que se entrega en EUR<input name="importe_eur" inputMode="decimal" maxLength={13} defaultValue={valores.importe_eur ?? ""} className={`${campo} cifra`} /></label>
      {e?.error && <p role="alert" className="font-medium text-red-700">{e.error}</p>}
      {e?.aviso && <p role="status" className="font-medium text-green-800">{e.aviso}</p>}
      <button disabled={p} className="bg-stone-900 px-4 py-3 text-white disabled:opacity-60">Guardar</button>
    </form>
  );
}
