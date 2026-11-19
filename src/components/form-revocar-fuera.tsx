"use client";

import { useActionState } from "react";
import { revocarFueraAccion, type EstadoRevocar } from "@/server/revocar-actions";

const campo = "mt-1 w-full rounded border border-slate-400 px-3 py-3 text-base";

export function FormRevocarFuera() {
  const [estado, enviar, pendiente] = useActionState<EstadoRevocar, FormData>(revocarFueraAccion, null);
  return (
    <form action={enviar} className="mt-3 grid max-w-xl gap-3">
      <label className="text-sm font-medium">Cédula<input name="cedula" required autoComplete="off" className={campo} /></label>
      <label className="text-sm font-medium">Apellidos<input name="apellidos" required autoComplete="off" className={campo} /></label>
      <label className="text-sm font-medium">Nombres<input name="nombres" required autoComplete="off" className={campo} /></label>
      {estado?.error && <p role="alert" className="font-medium text-red-700">{estado.error}</p>}
      {estado?.aviso && <p role="status" className="font-medium text-green-800">{estado.aviso}</p>}
      <button disabled={pendiente} className="rounded border border-red-600 px-4 py-3 font-semibold text-red-700 disabled:opacity-60">Revocar</button>
    </form>
  );
}
