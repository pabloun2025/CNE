"use client";

import { useActionState } from "react";
import type { EstadoFormulario } from "@/server/acceso-actions";

type Props = { accion: (estado: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>; titulo: string; etiquetaCorreo?: string; permitirDefinir?: boolean };

const campo = "mt-1 block w-full";
const etiqueta = "block text-base font-bold";

export function FormularioAcceso({ accion, titulo, etiquetaCorreo = "Correo", permitirDefinir = false }: Props) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  // Cuenta con contraseña pendiente: se pide definirla (dos veces) en lugar de la actual.
  const definir = !!estado?.definir;
  return (
    <main className="funcionario mx-auto max-w-sm p-6">
      <h1>{titulo}</h1>
      {/* La clave rehace el formulario tras el envío: así el correo escrito se conserva y la contraseña no. */}
      <form action={enviar} key={`${definir ? "definir" : "entrar"}-${estado?.correo ?? ""}-${estado?.error ?? ""}`} className="mt-4 space-y-4">
        <label className={etiqueta}>{etiquetaCorreo}
          <input name="correo" type="text" autoComplete="username" required readOnly={definir} defaultValue={estado?.correo} className={campo} />
        </label>
        {definir ? (
          <>
            <p className="text-base font-bold">Defina su contraseña</p>
            <label className={etiqueta}>Contraseña nueva (mínimo 8 caracteres)
              <input name="nueva" type="password" autoComplete="new-password" required minLength={8} className={campo} />
            </label>
            <label className={etiqueta}>Repita la contraseña
              <input name="repetir" type="password" autoComplete="new-password" required minLength={8} className={campo} />
            </label>
          </>
        ) : (
          <label className={etiqueta}>Contraseña
            <input name="password" type="password" autoComplete="current-password" required={!permitirDefinir} className={campo} />
          </label>
        )}
        {estado?.error && <p role="alert" className="text-base font-medium text-red-700">{estado.error}</p>}
        <button disabled={pendiente} className="min-h-12 w-full bg-stone-900 px-4 py-3 text-lg text-white disabled:opacity-60">{definir ? "Guardar y entrar" : "Entrar"}</button>
      </form>
    </main>
  );
}

export function FormularioCambio({ accion, obligatorio }: { accion: Props["accion"]; obligatorio: boolean }) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <main className="funcionario mx-auto max-w-sm p-6">
      <h1>Cambiar contraseña</h1>
      {obligatorio && <p className="mt-2 text-base">Debe elegir una contraseña propia antes de continuar.</p>}
      <form action={enviar} className="mt-4 space-y-4">
        <label className={etiqueta}>Contraseña actual
          <input name="actual" type="password" autoComplete="current-password" required className={campo} />
        </label>
        <label className={etiqueta}>Contraseña nueva (mínimo 8 caracteres)
          <input name="nueva" type="password" autoComplete="new-password" required minLength={8} className={campo} />
        </label>
        <label className={etiqueta}>Repita la contraseña nueva
          <input name="repetir" type="password" autoComplete="new-password" required minLength={8} className={campo} />
        </label>
        {estado?.error && <p role="alert" className="text-base font-medium text-red-700">{estado.error}</p>}
        <button disabled={pendiente} className="min-h-12 w-full bg-stone-900 px-4 py-3 text-lg text-white disabled:opacity-60">Guardar</button>
      </form>
    </main>
  );
}
