"use client";

import { useActionState, useState } from "react";
import { crearEnlaceAccion, crearOperadorAccion, restablecerPinAccion, type EstadoEstacion } from "@/server/estacion-actions";
import { FUNCIONES, FUNCION_NOMBRE, type Funcion } from "@/domain/estaciones";

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
      <label className="text-sm font-medium">Apellido<input name="apellido" required className={campo} /></label>
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

export function AccionesEnlaceEstacion({ url, etiqueta, funcion }: { url: string; etiqueta: string; funcion: Funcion }) {
  const [copia, setCopia] = useState<"copiado" | "manual" | null>(null);
  const mensaje = `CNE Madrid · ${FUNCION_NOMBRE[funcion]} · ${etiqueta}\n${url}${funcion === "mando" ? "\nAcceda con su PIN asignado." : ""}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopia("copiado");
    } catch {
      setCopia("manual");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="button-like secondary size-12 p-0!" aria-label="Copiar enlace" title="Copiar enlace" onClick={copiar}>
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M16 4H6a2 2 0 0 0-2 2v10" />
          </svg>
        </button>
        <a className="button-like secondary size-12 p-0!" aria-label="Compartir por WhatsApp" title="Compartir por WhatsApp" href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noreferrer">
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.4-4.3A8.5 8.5 0 1 1 20.5 11.7Z" />
            <path d="M8.3 8.4c-.8 1.9 1.6 5.6 4.4 6.7 1.4.5 2.4.2 3-.6l-2-1.4-1.1 1c-1.3-.6-2.3-1.6-2.9-2.9l.8-1.2-1.3-2.2c-.4.1-.7.3-.9.6Z" />
          </svg>
        </a>
      </div>
      {copia && <p role="status" className="text-sm">{copia === "copiado" ? "Enlace copiado." : "Toque el enlace para seleccionarlo y copiarlo."}</p>}
      {copia === "manual" && <input aria-label="Enlace de estación para copiar" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />}
    </div>
  );
}
