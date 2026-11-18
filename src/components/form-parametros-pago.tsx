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
      <label className="text-sm font-medium">Monto en dólares, el mismo para todos<input name="importe_usd" inputMode="decimal" defaultValue={valores.importe_usd ?? ""} className={campo} /></label>
      <label className="text-sm font-medium">Valor en euros<input name="importe_eur" inputMode="decimal" defaultValue={valores.importe_eur ?? ""} className={campo} /></label>
      <label className="text-sm font-medium">Nombre de quien paga<input name="pagador_nombre" defaultValue={valores.pagador_nombre ?? ""} className={campo} /></label>
      <label className="text-sm font-medium">Cargo del pagador<input name="pagador_cargo" defaultValue={valores.pagador_cargo ?? ""} className={campo} /></label>
      <label className="text-sm font-medium">Lugar del pago<input name="lugar" defaultValue={valores.lugar ?? ""} className={campo} /></label>
      {e?.error && <p role="alert" className="font-medium text-red-700">{e.error}</p>}
      {e?.aviso && <p role="status" className="font-medium text-green-800">{e.aviso}</p>}
      <button disabled={p} className="bg-stone-900 px-4 py-3 text-white disabled:opacity-60">Guardar parámetros</button>
    </form>
  );
}
