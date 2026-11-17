"use client";

import { useActionState } from "react";
import { crearMjrvAccion, editarMjrvAccion, type EstadoMjrv } from "@/server/mjrv-actions";
import type { DatosMjrv } from "@/server/mjrv";

const campo = "mt-1 w-full rounded border border-slate-400 px-3 py-3 text-base";

export function FormMjrv({ id, inicial }: { id?: number; inicial?: DatosMjrv }) {
  const [estado, enviar, pendiente] = useActionState<EstadoMjrv, FormData>(id ? editarMjrvAccion : crearMjrvAccion, null);
  const v = inicial;
  return (
    <form action={enviar} className="grid max-w-xl gap-3">
      {id && <input type="hidden" name="id" value={id} />}
      <label className="text-sm font-medium">Cédula<input name="cedula" defaultValue={v?.cedula} required className={campo} /></label>
      <label className="text-sm font-medium">Apellidos<input name="apellidos" defaultValue={v?.apellidos} required className={campo} /></label>
      <label className="text-sm font-medium">Nombres<input name="nombres" defaultValue={v?.nombres} required className={campo} /></label>
      <label className="text-sm font-medium">Cargo en la junta<input name="cargo" defaultValue={v?.cargo} required placeholder="Presidente, Secretario, Vocal, Suplente…" className={campo} /></label>
      <label className="text-sm font-medium">Junta de origen (H1–H41, M1–M54)<input name="junta" defaultValue={v?.junta} required className={campo} /></label>
      <label className="text-sm font-medium">Rótulo imprimible de la credencial (opcional)<input name="rotulo" defaultValue={v?.rotulo} className={campo} /></label>
      <label className="text-sm font-medium">Correo (opcional)<input name="correo" type="email" defaultValue={v?.correo} className={campo} /></label>
      <label className="text-sm font-medium">Teléfono (opcional)<input name="telefono" defaultValue={v?.telefono} className={campo} /></label>
      {estado?.error && <p role="alert" className="font-medium text-red-700">{estado.error}</p>}
      {estado?.aviso && <p role="status" className="font-medium text-green-800">{estado.aviso}</p>}
      <button disabled={pendiente} className="rounded bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60">{id ? "Guardar cambios" : "Crear ficha"}</button>
    </form>
  );
}
