"use client";

import { useActionState } from "react";
import { cambiarModoAccion, cargarDemoAccion, quitarDemoAccion, crearAdminAccion, restablecerAdminAccion, type EstadoSuper } from "@/server/superadmin-actions";

const campo = "mt-1 w-full rounded border border-slate-400 px-3 py-3 text-base";
const boton = "rounded bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60";

function Resultado({ estado }: { estado: EstadoSuper }) {
  if (!estado) return null;
  return (
    <div role="status" className="mt-2 text-sm">
      {estado.error && <p className="font-medium text-red-700">{estado.error}</p>}
      {estado.aviso && <p className="font-medium text-green-800">{estado.aviso}</p>}
      {estado.password && <p className="mt-1 break-all rounded bg-yellow-100 p-2 font-mono text-base">{estado.password}</p>}
    </div>
  );
}

export function FormCrearAdmin() {
  const [estado, enviar, pendiente] = useActionState(crearAdminAccion, null);
  return (
    <form action={enviar} className="space-y-3">
      <label className="block text-sm font-medium">Correo<input name="correo" type="email" required className={campo} /></label>
      <label className="block text-sm font-medium">Nombre<input name="nombre" required className={campo} /></label>
      <button disabled={pendiente} className={boton}>Crear cuenta</button>
      <Resultado estado={estado} />
    </form>
  );
}

export function FormRestablecer({ id }: { id: number }) {
  const [estado, enviar, pendiente] = useActionState(restablecerAdminAccion, null);
  return (
    <form action={enviar}>
      <input type="hidden" name="id" value={id} />
      <button disabled={pendiente} className="rounded border border-slate-500 px-3 py-2 text-sm font-medium">Restablecer contraseña</button>
      <Resultado estado={estado} />
    </form>
  );
}

export function FormModo({ destino, frase }: { destino: "prueba" | "eleccion"; frase: string }) {
  const [estado, enviar, pendiente] = useActionState(cambiarModoAccion, null);
  return (
    <form action={enviar} className="space-y-3">
      <input type="hidden" name="destino" value={destino} />
      <label className="block text-sm font-medium">Para confirmar escriba «{frase}»
        <input name="confirmacion" autoComplete="off" required className={campo} />
      </label>
      <button disabled={pendiente} className={boton}>{destino === "prueba" ? "Activar modo prueba" : "Pasar a modo elección"}</button>
      <Resultado estado={estado} />
    </form>
  );
}

export function FormDemo({ cargadas }: { cargadas: number }) {
  const [cargar, enviarCargar, p1] = useActionState(cargarDemoAccion, null);
  const [quitar, enviarQuitar, p2] = useActionState(quitarDemoAccion, null);
  return (
    <div className="space-y-3">
      <p className="text-sm">Fichas de demostración cargadas: <strong>{cargadas}</strong> (570 si están completas; ficticias, rotuladas «PRUEBA»).</p>
      <div className="flex flex-wrap gap-3">
        <form action={enviarCargar}><button disabled={p1} className={boton}>Cargar datos de demostración</button></form>
        <form action={enviarQuitar}><button disabled={p2} className="rounded border border-slate-500 px-4 py-3 font-semibold disabled:opacity-60">Quitar datos de demostración</button></form>
      </div>
      <Resultado estado={cargar} />
      <Resultado estado={quitar} />
    </div>
  );
}
