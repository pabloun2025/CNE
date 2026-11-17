"use client";

import { useActionState } from "react";
import { crearEnlaceAccion, crearOperadorAccion, restablecerPinAccion, type EstadoEstacion } from "@/server/estacion-actions";
import { FUNCIONES, FUNCION_NOMBRE } from "@/domain/estaciones";

const campo = "mt-1 w-full rounded border border-slate-400 px-3 py-3 text-base";
const boton = "rounded bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60";

function Msg({ e }: { e: EstadoEstacion }) {
  return e ? <p role="status" className={`text-sm font-medium ${e.error ? "text-red-700" : "text-green-800"}`}>{e.error ?? e.aviso}</p> : null;
}

export function FormOperador() {
  const [e, enviar, p] = useActionState<EstadoEstacion, FormData>(crearOperadorAccion, null);
  return (
    <form action={enviar} className="grid max-w-sm gap-3">
      <label className="text-sm font-medium">Nombre<input name="nombre" required className={campo} /></label>
      <fieldset className="text-sm font-medium"><legend>Funciones</legend>
        {FUNCIONES.map((f) => <label key={f} className="mr-4 inline-flex items-center gap-1 py-1"><input type="checkbox" name="funciones" value={f} /> {FUNCION_NOMBRE[f]}</label>)}
      </fieldset>
      <label className="text-sm font-medium">PIN de 4 dígitos<input name="pin" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" className={campo} /></label>
      <label className="text-sm font-medium">Repita el PIN<input name="pin2" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" className={campo} /></label>
      <button disabled={p} className={boton}>Crear operador</button>
      <Msg e={e} />
    </form>
  );
}

export function FormPin({ id }: { id: number }) {
  const [e, enviar, p] = useActionState<EstadoEstacion, FormData>(restablecerPinAccion, null);
  return (
    <form action={enviar} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <input name="pin" aria-label="PIN nuevo" placeholder="PIN nuevo" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" className="w-24 rounded border border-slate-400 px-2 py-2" />
      <input name="pin2" aria-label="Repetir PIN" placeholder="Repetir" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" className="w-24 rounded border border-slate-400 px-2 py-2" />
      <button disabled={p} className="rounded border border-slate-500 px-3 py-2 text-sm font-medium">Restablecer PIN</button>
      <Msg e={e} />
    </form>
  );
}

export function FormEnlace() {
  const [e, enviar, p] = useActionState<EstadoEstacion, FormData>(crearEnlaceAccion, null);
  return (
    <form action={enviar} className="grid max-w-sm gap-3">
      <label className="text-sm font-medium">Función
        <select name="funcion" className={campo}>{FUNCIONES.map((f) => <option key={f} value={f}>{FUNCION_NOMBRE[f]}</option>)}</select>
      </label>
      <label className="text-sm font-medium">Etiqueta (por ejemplo «Puerta 1»)<input name="etiqueta" required className={campo} /></label>
      <button disabled={p} className={boton}>Crear enlace</button>
      <Msg e={e} />
    </form>
  );
}
