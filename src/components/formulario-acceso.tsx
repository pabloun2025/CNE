"use client";

import { useActionState } from "react";
import type { EstadoFormulario } from "@/server/acceso-actions";

type Props = { accion: (estado: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>; titulo: string; etiquetaCorreo?: string; permitirDefinir?: boolean };

const campo = "mt-1 w-full rounded border border-slate-400 px-3 py-3 text-base";

export function FormularioAcceso({ accion, titulo, etiquetaCorreo = "Correo", permitirDefinir = false }: Props) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  // Cuenta con contraseña pendiente: se pide definirla (dos veces) en lugar de la actual.
  const definir = !!estado?.definir;
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-semibold">{titulo}</h1>
      <form action={enviar} className="mt-4 space-y-4">
        <label className="block text-sm font-medium">{etiquetaCorreo}
          <input name="correo" type="text" autoComplete="username" required readOnly={definir} defaultValue={estado?.correo} className={campo} />
        </label>
        {definir ? (
          <>
            <p className="text-sm font-medium">Defina su contraseña</p>
            <label className="block text-sm font-medium">Contraseña nueva (mínimo 8 caracteres)
              <input name="nueva" type="password" autoComplete="new-password" required minLength={8} className={campo} />
            </label>
            <label className="block text-sm font-medium">Repita la contraseña
              <input name="repetir" type="password" autoComplete="new-password" required minLength={8} className={campo} />
            </label>
          </>
        ) : (
          <label className="block text-sm font-medium">Contraseña
            <input name="password" type="password" autoComplete="current-password" required={!permitirDefinir} className={campo} />
          </label>
        )}
        {estado?.error && <p role="alert" className="text-sm font-medium text-red-700">{estado.error}</p>}
        <button disabled={pendiente} className="w-full rounded bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60">{definir ? "Guardar y entrar" : "Entrar"}</button>
      </form>
    </main>
  );
}

export function FormularioCambio({ accion, obligatorio }: { accion: Props["accion"]; obligatorio: boolean }) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <main className="mx-auto max-w-sm p-6">
      <h1 className="text-xl font-semibold">Cambiar contraseña</h1>
      {obligatorio && <p className="mt-2 text-sm">Debe elegir una contraseña propia antes de continuar.</p>}
      <form action={enviar} className="mt-4 space-y-4">
        <label className="block text-sm font-medium">Contraseña actual
          <input name="actual" type="password" autoComplete="current-password" required className={campo} />
        </label>
        <label className="block text-sm font-medium">Contraseña nueva (mínimo 8 caracteres)
          <input name="nueva" type="password" autoComplete="new-password" required minLength={8} className={campo} />
        </label>
        <label className="block text-sm font-medium">Repita la contraseña nueva
          <input name="repetir" type="password" autoComplete="new-password" required minLength={8} className={campo} />
        </label>
        {estado?.error && <p role="alert" className="text-sm font-medium text-red-700">{estado.error}</p>}
        <button disabled={pendiente} className="w-full rounded bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60">Guardar</button>
      </form>
    </main>
  );
}
