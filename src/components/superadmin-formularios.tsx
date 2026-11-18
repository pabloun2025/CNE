"use client";

import { useActionState } from "react";
import { cambiarModoAccion, cargarDemoAccion, prepararEleccionAccion, respaldarAccion, interruptorEnvioAccion, reanudarEnviosAccion, guardarRemitenteAccion, quitarDemoAccion, crearAdminAccion, restablecerAdminAccion, type EstadoSuper } from "@/server/superadmin-actions";

const campo = "mt-1 w-full rounded border border-slate-400 px-3 py-3 text-base";
const boton = "rounded bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60";

function Resultado({ estado }: { estado: EstadoSuper }) {
  if (!estado) return null;
  return (
    <div role="status" className="mt-2 text-sm">
      {estado.error && <p className="font-medium text-red-700">{estado.error}</p>}
      {estado.aviso && <p className="font-medium text-green-800">{estado.aviso}</p>}
      {estado.detalle && <ul className="mt-1 list-disc pl-5">{estado.detalle.map((d) => <li key={d}>{d}</li>)}</ul>}
      {estado.enlace && <p className="mt-2"><a href={estado.enlace} className="inline-block rounded bg-slate-800 px-4 py-3 font-semibold text-white">Descargar respaldo</a></p>}
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

export function FormPreparar({ resumen, conserva }: { resumen: { etiqueta: string; n: number }[]; conserva: string[] }) {
  const [estado, enviar, pendiente] = useActionState(prepararEleccionAccion, null);
  const [respaldo, enviarRespaldo, p2] = useActionState(respaldarAccion, null);
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Se borrará solo lo marcado como prueba:</p>
      <ul className="list-disc pl-5 text-sm">{resumen.map((r) => <li key={r.etiqueta}>{r.etiqueta}: <strong>{r.n}</strong></li>)}</ul>
      <p className="text-sm font-medium">Se conserva:</p>
      <ul className="list-disc pl-5 text-sm">{conserva.map((c) => <li key={c}>{c}</li>)}</ul>
      <p className="text-sm">Antes de borrar se hace un respaldo completo de la base y se comprueba. Si el respaldo falla, no se borra nada. Después el sistema pasa a modo elección.</p>
      <form action={enviarRespaldo}><button disabled={p2} className="rounded border border-slate-500 px-4 py-3 font-semibold disabled:opacity-60">Solo crear respaldo para descargar</button></form>
      <Resultado estado={respaldo} />
      <form action={enviar} className="max-w-sm space-y-3">
        <label className="block text-sm font-medium">Para confirmar escriba «PREPARAR ELECCIÓN»
          <input name="confirmacion" autoComplete="off" required className={campo} />
        </label>
        <button disabled={pendiente} className="rounded bg-red-700 px-4 py-3 font-semibold text-white disabled:opacity-60">Borrar datos de prueba y preparar para elección</button>
      </form>
      <Resultado estado={estado} />
    </div>
  );
}

export function FormInterruptor({ canal, encendido }: { canal: "whatsapp" | "correo"; encendido: boolean }) {
  const [estado, enviar, pendiente] = useActionState(interruptorEnvioAccion, null);
  return (
    <form action={enviar} className="space-y-3">
      <input type="hidden" name="canal" value={canal} />
      <input type="hidden" name="destino" value={encendido ? "apagar" : "encender"} />
      {!encendido && <label className="block text-sm font-medium">Para encender escriba «ENVIO REAL»<input name="confirmacion" autoComplete="off" required className={campo} /></label>}
      <button disabled={pendiente} className={encendido ? "rounded border border-red-700 px-4 py-3 font-semibold text-red-700 disabled:opacity-60" : boton}>{encendido ? "Apagar el envío real" : "Encender el envío real"}</button>
      <Resultado estado={estado} />
    </form>
  );
}

export function FormReanudar({ canal }: { canal: "whatsapp" | "correo" }) {
  const [estado, enviar, pendiente] = useActionState(reanudarEnviosAccion, null);
  return (
    <form action={enviar}>
      <input type="hidden" name="canal" value={canal} />
      <button disabled={pendiente} className={boton}>Reanudar envíos</button>
      <Resultado estado={estado} />
    </form>
  );
}

export function FormRemitente({ direccion, nombre }: { direccion: string; nombre: string }) {
  const [estado, enviar, pendiente] = useActionState(guardarRemitenteAccion, null);
  return (
    <form action={enviar} className="max-w-sm space-y-3">
      <label className="block text-sm font-medium">Dirección del remitente<input name="direccion" type="email" defaultValue={direccion} required className={campo} /></label>
      <label className="block text-sm font-medium">Nombre del remitente<input name="nombre" defaultValue={nombre} required maxLength={70} className={campo} /></label>
      <button disabled={pendiente} className={boton}>Guardar remitente</button>
      <Resultado estado={estado} />
    </form>
  );
}
