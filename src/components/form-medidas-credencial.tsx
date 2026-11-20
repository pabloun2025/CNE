"use client";

import { useActionState } from "react";
import type { MedidasCredencial } from "@/domain/credencial-layout";
import { guardarMedidasCredencialAccion } from "@/server/credencial-config-actions";

export function FormMedidasCredencial({ medidas }: { medidas: MedidasCredencial }) {
  const [estado, guardar, pendiente] = useActionState(guardarMedidasCredencialAccion, null);
  return (
    <form action={guardar} className="stack">
      <div className="grid grid-cols-2 gap-3">
        <label>Ancho (mm)<input className="w-full" name="ancho" inputMode="decimal" defaultValue={String(medidas.ancho).replace(".", ",")} maxLength={6} required /></label>
        <label>Alto (mm)<input className="w-full" name="alto" inputMode="decimal" defaultValue={String(medidas.alto).replace(".", ",")} maxLength={6} required /></label>
      </div>
      {estado?.error && <p role="alert" className="text-red-700">{estado.error}</p>}
      {estado?.aviso && <p role="status" className="text-green-800">{estado.aviso}</p>}
      <button disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar medidas"}</button>
    </form>
  );
}
