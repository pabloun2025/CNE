"use client";

import { useActionState } from "react";
import { guardarParametrosAccion, type EstadoPago } from "@/server/pago-actions";

const campo = "mt-1 block w-full";

export function FormParametrosPago({ nombre, cargo }: { nombre: string; cargo: string }) {
  const [e, enviar, p] = useActionState<EstadoPago, FormData>(guardarParametrosAccion, null);
  return (
    <form action={enviar} className="grid max-w-xl gap-3">
      <label className="block text-base font-bold">Nombre del funcionario que firma los recibos<input name="pagador_nombre" defaultValue={nombre} maxLength={120} className={campo} /></label>
      <label className="block text-base font-bold">Cargo del funcionario<input name="pagador_cargo" defaultValue={cargo} maxLength={120} className={campo} /></label>
      {e?.error && <p role="alert" className="font-medium text-red-700">{e.error}</p>}
      {e?.aviso && <p role="status" className="font-medium text-green-800">{e.aviso}</p>}
      <button disabled={p} className="bg-stone-900 px-4 py-3 text-white disabled:opacity-60">Guardar</button>
    </form>
  );
}
