"use client";

import { useActionState } from "react";
import { CARGOS_FICHA, CEDULA_MAX, CEDULA_MIN, opcionesJuntas, PREFIJO_MOVIL } from "@/domain/ingreso";
import { crearMjrvAccion, editarMjrvAccion, type EstadoMjrv } from "@/server/mjrv-actions";
import type { DatosMjrv } from "@/server/mjrv";

const campo = "mt-1 w-full rounded border border-slate-400 px-3 py-3 text-base";
const JUNTAS = opcionesJuntas();

function cargoInicial(cargo?: string): string {
  const c = (cargo ?? "").trim().toLowerCase();
  return CARGOS_FICHA.find((x) => x.valor === c || x.etiqueta.toLowerCase() === c)?.valor ?? "";
}

export function FormMjrv({ id, inicial }: { id?: number; inicial?: DatosMjrv }) {
  const [estado, enviar, pendiente] = useActionState<EstadoMjrv, FormData>(id ? editarMjrvAccion : crearMjrvAccion, null);
  const v = inicial;
  const junta = v?.junta?.trim().toUpperCase() ?? "";
  return (
    <form action={enviar} className="grid max-w-xl gap-3">
      {id && <input type="hidden" name="id" value={id} />}
      <label className="text-sm font-medium">Cédula
        <input name="cedula" defaultValue={v?.cedula} required minLength={CEDULA_MIN} maxLength={CEDULA_MAX} pattern="[0-9A-Za-z-]{5,20}" className={campo} />
      </label>
      <label className="text-sm font-medium">Apellidos<input name="apellidos" defaultValue={v?.apellidos} required className={campo} /></label>
      <label className="text-sm font-medium">Nombres<input name="nombres" defaultValue={v?.nombres} required className={campo} /></label>
      <label className="text-sm font-medium">Cargo
        <select name="cargo" defaultValue={cargoInicial(v?.cargo)} required className={campo}>
          <option value="">Elija el cargo</option>
          {CARGOS_FICHA.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Junta
        <select name="junta" defaultValue={JUNTAS.some((j) => j.valor === junta) ? junta : ""} required className={campo}>
          <option value="">Elija la junta</option>
          {JUNTAS.map((j) => <option key={j.valor} value={j.valor}>{j.etiqueta}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Rótulo imprimible de la credencial (opcional)<input name="rotulo" defaultValue={v?.rotulo} className={campo} /></label>
      <label className="text-sm font-medium">Correo (opcional)<input name="correo" type="email" defaultValue={v?.correo} className={campo} /></label>
      <label className="text-sm font-medium">Móvil (opcional)
        <input name="telefono" defaultValue={v?.telefono || PREFIJO_MOVIL} inputMode="tel" autoComplete="tel" className={campo} />
      </label>
      {estado?.error && <p role="alert" className="font-medium text-red-700">{estado.error}</p>}
      {estado?.aviso && <p role="status" className="font-medium text-green-800">{estado.aviso}</p>}
      <button disabled={pendiente} className="rounded bg-blue-700 px-4 py-3 font-semibold text-white disabled:opacity-60">{id ? "Guardar cambios" : "Crear ficha"}</button>
    </form>
  );
}
