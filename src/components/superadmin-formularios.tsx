"use client";

import { ETIQUETA_ROL, ROLES_ADMIN, type RolAdmin } from "@/domain/roles";
import { useActionState } from "react";
import { cambiarModoAccion, cargarDemoAccion, reiniciarOperativoAccion, borrarFotosAccion, interruptorEnvioAccion, reanudarEnviosAccion, guardarRemitenteAccion, quitarDemoAccion, cambiarRolAccion, crearAdminAccion, restablecerAdminAccion, type EstadoSuper } from "@/server/superadmin-actions";

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
      <label className="block text-sm font-medium">Correo o nombre de usuario<input name="correo" type="text" autoComplete="off" required className={campo} /></label>
      <label className="block text-sm font-medium">Nombre<input name="nombre" required className={campo} /></label>
      <label className="block text-sm font-medium">Permiso
        <select name="rol" required defaultValue="" className={campo}>
          <option value="" disabled>Elija un permiso</option>
          {ROLES_ADMIN.map((r) => <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Contraseña inicial (mínimo 8 caracteres)
        <input name="password" type="password" autoComplete="new-password" required minLength={8} className={campo} />
      </label>
      <label className="block text-sm font-medium">Repita la contraseña
        <input name="repetir" type="password" autoComplete="new-password" required minLength={8} className={campo} />
      </label>
      <button disabled={pendiente} className={boton}>Crear cuenta</button>
      <Resultado estado={estado} />
    </form>
  );
}

export function FormCambiarRol({ id, rol }: { id: number; rol: RolAdmin }) {
  const [estado, enviar, pendiente] = useActionState(cambiarRolAccion, null);
  return (
    <form action={enviar} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <label className="text-sm font-medium">Permiso
        <select name="rol" defaultValue={rol} className="mt-1 block rounded border border-slate-400 px-2 py-2 text-sm">
          {ROLES_ADMIN.map((r) => <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>)}
        </select>
      </label>
      <button disabled={pendiente} className="rounded border border-slate-500 px-3 py-2 text-sm font-medium">Guardar permiso</button>
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

export function FormReiniciarOperativo({ resumen, revision, conserva }: { resumen: { etiqueta: string; n: number }[]; revision: string; conserva: string[] }) {
  const [estado, enviar, pendiente] = useActionState(reiniciarOperativoAccion, null);
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-red-800">Borrado irreversible de TODO el operativo, tanto en modo prueba como en modo elección.</p>
      <p className="text-sm">Se eliminarán las fichas MJRV importadas desde Excel y las de demostración, sus ingresos, movimientos, fotografías de cédula, recibos, pagos, firmas, revocaciones y el historial y la cola de envíos de credenciales. No se crea ninguna copia de seguridad.</p>
      <p className="text-sm font-medium">Registros operativos que se eliminarán en ambos modos <strong>({resumen.reduce((total, fila) => total + fila.n, 0)})</strong></p>
      <ul className="list-disc pl-5 text-sm">{resumen.map((r) => <li key={r.etiqueta}>{r.etiqueta}: <strong>{r.n}</strong></li>)}</ul>
      <p className="text-sm font-medium">Se conservan:</p>
      <ul className="list-disc pl-5 text-sm">{conserva.map((texto) => <li key={texto}>{texto}</li>)}</ul>
      <p className="text-sm">Al finalizar, el sistema quedará en modo elección, vacío de actividad y preparado para importar nuevamente los MJRV. El correo y WhatsApp reales quedarán apagados hasta que se habiliten expresamente. Los mensajes ya enviados a terceros no pueden retirarse.</p>
      <form action={enviar} className="max-w-sm space-y-3">
        <input type="hidden" name="revision" value={revision} />
        <label className="block text-sm font-medium">Para confirmar el borrado irreversible escriba «BORRAR TODO»
          <input key={revision} name="confirmacion" autoComplete="off" required pattern="BORRAR TODO" className={campo} />
        </label>
        <button disabled={pendiente} className="rounded bg-red-700 px-4 py-3 font-semibold text-white disabled:opacity-60">{pendiente ? "Reiniciando…" : "Borrar todo y reiniciar operativo"}</button>
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

export function FormBorrarFotos({ fotos, personas, sinPago }: { fotos: number; personas: number; sinPago: number }) {
  const [estado, enviar, pendiente] = useActionState(borrarFotosAccion, null);
  return (
    <div className="space-y-3">
      <p className="text-sm">Hay <strong>{fotos}</strong> fotos de <strong>{personas}</strong> personas; <strong>{sinPago}</strong> de ellas aún sin pago confirmado. Las fotos se conservan hasta que usted las borre aquí.</p>
      <p className="text-sm font-medium text-red-800">Borrar es definitivo: finanzas volverá a pedir las fotos. Las copias de seguridad diarias guardan las fotos cifradas hasta 14 días.</p>
      <form action={enviar} className="max-w-sm space-y-3">
        <label className="block text-sm font-medium">Para confirmar escriba «BORRAR FOTOS»<input name="confirmacion" autoComplete="off" required className={campo} /></label>
        <button disabled={pendiente || fotos === 0} className="rounded bg-red-700 px-4 py-3 font-semibold text-white disabled:opacity-60">Borrar todas las fotos de cédula</button>
      </form>
      <Resultado estado={estado} />
    </div>
  );
}
