"use client";

import { useActionState } from "react";
import type { ParametrosPago } from "@/domain/pago";
import { guardarParametrosAccion, type EstadoPago } from "@/server/pago-actions";

const campo = "mt-1 w-full rounded border border-slate-400 px-3 py-3 text-base";

// Todos los campos nacen vacíos: la interfaz no propone ningún valor (P-7).
export function FormParametrosPago({ valores }: { valores: ParametrosPago }) {
  const [e, enviar, p] = useActionState<EstadoPago, FormData>(guardarParametrosAccion, null);
  return (
    <form action={enviar} className="grid max-w-xl gap-3">
      <label className="text-sm font-medium">Importe general en USD<input name="importe_usd" inputMode="decimal" defaultValue={valores.importe_usd ?? ""} className={campo} /></label>
      <label className="text-sm font-medium">Tipo de cambio<input name="tipo_cambio" inputMode="decimal" defaultValue={valores.tipo_cambio ?? ""} className={campo} /></label>
      <label className="text-sm font-medium">Sentido del cambio
        <select name="sentido_cambio" defaultValue={valores.sentido_cambio ?? ""} className={campo}>
          <option value="">(sin definir)</option><option value="eur_por_usd">1 USD = x EUR</option><option value="usd_por_eur">1 EUR = x USD</option>
        </select>
      </label>
      <label className="text-sm font-medium">Decimales en EUR
        <select name="decimales_eur" defaultValue={valores.decimales_eur === null ? "" : String(valores.decimales_eur)} className={campo}>
          <option value="">(sin definir)</option><option value="2">2 decimales</option><option value="0">Euros enteros</option>
        </select>
      </label>
      <label className="text-sm font-medium">Redondeo
        <select name="redondeo" defaultValue={valores.redondeo ?? ""} className={campo}>
          <option value="">(sin definir)</option><option value="mitad_arriba">Mitad hacia arriba</option><option value="truncar">Truncar</option>
        </select>
      </label>
      <label className="text-sm font-medium">Nombre del pagador<input name="pagador_nombre" defaultValue={valores.pagador_nombre ?? ""} className={campo} /></label>
      <label className="text-sm font-medium">Cargo del pagador<input name="pagador_cargo" defaultValue={valores.pagador_cargo ?? ""} className={campo} /></label>
      <label className="text-sm font-medium">Lugar del pago<input name="lugar" defaultValue={valores.lugar ?? ""} className={campo} /></label>
      {e?.error && <p role="alert" className="font-medium text-red-700">{e.error}</p>}
      {e?.aviso && <p role="status" className="font-medium text-green-800">{e.aviso}</p>}
      <button disabled={p} className="rounded bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60">Guardar parámetros</button>
    </form>
  );
}
