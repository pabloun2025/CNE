"use client";

import { useActionState } from "react";
import type { EstadoFormulario } from "@/server/acceso-actions";
import { Masthead } from "./marca";

type Props = { accion: (estado: EstadoFormulario, datos: FormData) => Promise<EstadoFormulario>; titulo: string; etiquetaCorreo?: string; permitirDefinir?: boolean; empezarDefiniendo?: boolean; usuarioInicial?: string };

export function FormularioAcceso({ accion, titulo, etiquetaCorreo = "Correo", permitirDefinir = false, empezarDefiniendo = false, usuarioInicial }: Props) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  // Si la cuenta aún no tiene contraseña, el formulario ya pide definirla. No hay un campo vacío para entrar.
  const definir = estado ? !!estado.definir : empezarDefiniendo;
  return (
    <div className="funcionario sheet">
      <Masthead titulo={titulo} />
      <main>
        <header className="hero"><h1>{titulo}</h1></header>
        {/* La clave rehace el formulario tras el envío: así el correo escrito se conserva y la contraseña no. */}
        <form action={enviar} key={`${definir ? "definir" : "entrar"}-${estado?.correo ?? ""}-${estado?.error ?? ""}`} className="card stack">
          <label className="field">{etiquetaCorreo}
            <input name="correo" type="text" autoComplete="username" required readOnly={definir} defaultValue={estado?.correo ?? (definir ? usuarioInicial : undefined)} />
          </label>
          {definir ? (
            <>
              <p>Defina su contraseña</p>
              <label className="field">Contraseña nueva (mínimo 8 caracteres)
                <input name="nueva" type="password" autoComplete="new-password" required minLength={8} />
              </label>
              <label className="field">Repita la contraseña
                <input name="repetir" type="password" autoComplete="new-password" required minLength={8} />
              </label>
            </>
          ) : (
            <label className="field">Contraseña
              <input name="password" type="password" autoComplete="current-password" required={!permitirDefinir} />
            </label>
          )}
          {estado?.error && <p role="alert" className="banner bad">{estado.error}</p>}
          <button disabled={pendiente}>{definir ? "Guardar y entrar" : "Entrar"}</button>
        </form>
      </main>
    </div>
  );
}

export function FormularioCambio({ accion, obligatorio }: { accion: Props["accion"]; obligatorio: boolean }) {
  const [estado, enviar, pendiente] = useActionState(accion, null);
  return (
    <div className="funcionario sheet">
      <Masthead titulo="CNE 2026" detalle="Cambiar contraseña" />
      <main>
        <header className="hero"><h1>Cambiar contraseña</h1></header>
        {obligatorio && <p>Debe elegir una contraseña propia antes de continuar.</p>}
        <form action={enviar} className="card stack">
          <label className="field">Contraseña actual
            <input name="actual" type="password" autoComplete="current-password" required />
          </label>
          <label className="field">Contraseña nueva (mínimo 8 caracteres)
            <input name="nueva" type="password" autoComplete="new-password" required minLength={8} />
          </label>
          <label className="field">Repita la contraseña nueva
            <input name="repetir" type="password" autoComplete="new-password" required minLength={8} />
          </label>
          {estado?.error && <p role="alert" className="banner bad">{estado.error}</p>}
          <button disabled={pendiente}>Guardar</button>
        </form>
      </main>
    </div>
  );
}
